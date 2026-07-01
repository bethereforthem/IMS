"""
IMS v3.0 — FastAPI application entry point.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.v1 import auth, suspects, identity, intelligence, location, cases, corrections, admin
from app.models.schemas import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown — close service connections
    from app.services.nida import nida_service
    await nida_service.close()


app = FastAPI(
    title="Intelligence Management System (IMS)",
    version="3.0",
    description=(
        "Rwanda IMS — Digital Identity Verification, Source Attribution, "
        "Location Intelligence, and Criminal Records Management."
    ),
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# CORS — restricted to internal networks only in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"] if settings.ENVIRONMENT == "development" else [],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---- Routes ----
api_prefix = "/api/v1"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(suspects.router, prefix=api_prefix)
app.include_router(identity.router, prefix=api_prefix)
app.include_router(intelligence.router, prefix=api_prefix)
app.include_router(location.router, prefix=api_prefix)
app.include_router(cases.router, prefix=api_prefix)
app.include_router(corrections.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    return HealthResponse(status="ok", environment=settings.ENVIRONMENT)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger("ims").error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
