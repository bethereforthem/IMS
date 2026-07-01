"""
Role-Based Access Control (RBAC) — permission definitions and FastAPI dependencies.
"""
from typing import Set
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.security import decode_token
from jose import JWTError

bearer_scheme = HTTPBearer()


# ---- Permission Sets per Role ----

PERMISSIONS: dict[str, Set[str]] = {
    "NISS_DIRECTOR": {
        "suspects:read", "suspects:write", "suspects:classify",
        "cases:read", "cases:write",
        "location:read:all", "location:read:top_secret",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query", "interpol:manage",
        "corrections:read", "corrections:write",
        "watchlist:read", "watchlist:write",
        "siem:read", "siem:manage",
        "revocation:any",
        "emergency_lockdown",
        "international:manage",
        "audit:read",
        "alerts:read", "alerts:acknowledge",
        "camera_nodes:manage",
        "source_attribution:read",
    },
    "NISS_OFFICER": {
        "suspects:read", "suspects:write",
        "cases:read", "cases:write",
        "location:read:all", "location:read:top_secret",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query",
        "corrections:read",
        "watchlist:read",
        "siem:read",
        "revocation:any",
        "international:manage",
        "audit:read",
        "alerts:read", "alerts:acknowledge",
        "source_attribution:read",
    },
    "RNP_COMMANDER": {
        "suspects:read", "suspects:write",
        "cases:read", "cases:write",
        "location:read:limited",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query",
        "corrections:read",
        "watchlist:read", "watchlist:write",
        "revocation:own",
        "alerts:read", "alerts:acknowledge",
        "audit:read:own_institution",
        "source_attribution:read",
    },
    "RNP_DETECTIVE": {
        "suspects:read", "suspects:write",
        "cases:read", "cases:write",
        "location:read:limited",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query",
        "corrections:read",
        "watchlist:read", "watchlist:write",
        "alerts:read", "alerts:acknowledge",
        "source_attribution:read",
    },
    "RNP_PATROL": {
        "suspects:read",
        "nid:scan", "nid:query", "face:scan",
        "watchlist:read",
        "alerts:read",
    },
    "RIB_INVESTIGATOR": {
        "suspects:read", "suspects:write",
        "cases:read", "cases:write",
        "location:read:limited",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query",
        "corrections:read",
        "watchlist:read", "watchlist:write",
        "revocation:own",
        "alerts:read", "alerts:acknowledge",
        "source_attribution:read",
    },
    "RIB_ANALYST": {
        "suspects:read",
        "cases:read",
        "nid:scan", "nid:query", "face:scan",
        "watchlist:read",
        "alerts:read",
        "source_attribution:read",
    },
    "RDF_COMMANDER": {
        "suspects:read",
        "cases:read",
        "location:read:border",
        "nid:scan", "nid:query", "face:scan",
        "interpol:query",
        "watchlist:read",
        "revocation:own",
        "alerts:read", "alerts:acknowledge",
        "source_attribution:read",
    },
    "RDF_BORDER_OFFICER": {
        "suspects:read",
        "nid:scan", "nid:query", "face:scan",
        "watchlist:read",
        "alerts:read",
    },
    "RCS_SUPERINTENDENT": {
        "suspects:read",
        "cases:read",
        "corrections:read", "corrections:write",
        "nid:scan", "nid:query", "face:scan:limited",
        "watchlist:read",
        "revocation:own",
        "alerts:read",
        "source_attribution:read",
    },
    "RCS_OFFICER": {
        "suspects:read",
        "corrections:read", "corrections:write",
        "nid:scan",
        "watchlist:read",
    },
    "IRONDO_PATROL": {
        "watchlist:read",
        "nid:scan:result_only",  # match/no-match only — no full record
    },
    "DASSO_OFFICER": {
        "watchlist:read",
        "nid:scan:result_only",
    },
    "SIEM_ANALYST": {
        "siem:read", "siem:manage",
        "audit:read",
        "revocation:own",
        "suspects:read",
        "alerts:read",
        "source_attribution:read",
    },
    "SYSTEM_ADMIN": {
        "camera_nodes:manage",
        "siem:read",
        "revocation:own",
        "audit:read",
        "alerts:read",
    },
}

# Roles that can initiate emergency lockdown
LOCKDOWN_ROLES = {"NISS_DIRECTOR"}

# Roles that can revoke access for any institution
ANY_REVOCATION_ROLES = {"NISS_DIRECTOR", "NISS_OFFICER"}

# Roles with access to TOP SECRET location data
TOP_SECRET_LOCATION_ROLES = {"NISS_DIRECTOR", "NISS_OFFICER"}

# DIV app full access roles
DIV_FULL_ACCESS_ROLES = {
    "NISS_DIRECTOR", "NISS_OFFICER",
    "RNP_COMMANDER", "RNP_DETECTIVE", "RNP_PATROL",
    "RIB_INVESTIGATOR", "RIB_ANALYST",
    "RDF_COMMANDER", "RDF_BORDER_OFFICER",
    "RCS_SUPERINTENDENT", "RCS_OFFICER",
}


# ---- Current User Context ----

class CurrentUser:
    def __init__(self, payload: dict):
        self.user_id: str = payload["sub"]
        self.institution: str = payload["institution"]
        self.role: str = payload["role"]
        self.clearance: str = payload["clearance"]
        self.session_id: str = payload.get("session_id")
        self._permissions: Set[str] = PERMISSIONS.get(self.role, set())

    def has_permission(self, permission: str) -> bool:
        return permission in self._permissions

    def can_access_location(self) -> bool:
        return any(p.startswith("location:read") for p in self._permissions)

    def is_niss(self) -> bool:
        return self.institution == "NISS"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")
    return CurrentUser(payload)


def require_permission(permission: str):
    """FastAPI dependency — raises 403 if the user lacks the given permission."""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission}",
            )
        return user
    return _check


def require_niss():
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.is_niss():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="NISS access only")
        return user
    return _check
