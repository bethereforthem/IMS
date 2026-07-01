"""
Request middleware: source attribution injection, audit logging, RLS context setting.
"""
import time
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.models.database import AsyncSessionLocal, AuditLog


class RLSContextMiddleware(BaseHTTPMiddleware):
    """
    Sets PostgreSQL session variables so Row Level Security policies
    can read the current user's identity and clearance from any query.
    """

    async def dispatch(self, request: Request, call_next):
        # JWT payload is attached by auth dependency; read from request state
        user = getattr(request.state, "current_user", None)
        if user:
            async with AsyncSessionLocal() as session:
                await session.execute(text(
                    "SELECT "
                    "set_config('app.current_user_id', :uid, TRUE), "
                    "set_config('app.current_institution', :inst, TRUE), "
                    "set_config('app.current_role', :role, TRUE), "
                    "set_config('app.current_clearance', :clr, TRUE)"
                ), {
                    "uid": str(user.user_id),
                    "inst": user.institution,
                    "role": user.role,
                    "clr": user.clearance,
                })
        return await call_next(request)


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Logs mutating API calls (POST/PUT/PATCH/DELETE) to the audit log.
    Read operations are logged at the endpoint level for sensitive resources.
    """

    SKIP_PATHS = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if request.url.path not in self.SKIP_PATHS:
                user = getattr(request.state, "current_user", None)
                if user:
                    try:
                        async with AsyncSessionLocal() as session:
                            session.add(AuditLog(
                                event_type="API_REQUEST",
                                actor_id=UUID(user.user_id),
                                actor_role=user.role,
                                actor_institution=user.institution,
                                action=request.method,
                                target_type=request.url.path,
                                ip_address=request.client.host if request.client else None,
                                after_state={"status_code": response.status_code, "elapsed_ms": elapsed_ms},
                            ))
                            await session.commit()
                    except Exception:
                        pass  # Never let audit failure break the request

        return response
