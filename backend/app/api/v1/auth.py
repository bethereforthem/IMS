"""
Authentication API — login, refresh, MFA setup, logout.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rbac import get_current_user, CurrentUser
from app.core.security import (
    verify_password, hash_password, verify_totp,
    create_access_token, create_refresh_token, decode_token,
    hash_token, generate_totp_secret, get_totp_uri,
)
from app.models.database import User, UserSession, AuditLog, get_db
from app.models.schemas import (
    LoginRequest, TokenResponse, RefreshRequest,
    TOTPSetupResponse, MessageResponse, UserCreate, UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.badge_number == body.badge_number, User.active == True)
    )
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked — contact your supervisor")

    # TOTP verification (mandatory)
    if not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA not configured — contact system administrator",
        )
    if not verify_totp(user.totp_secret, body.totp_code):
        user.mfa_failures += 1
        if user.mfa_failures >= 3:
            user.locked = True
            await _audit(db, "MFA_LOCKOUT", user.id, "LOGIN", "Account locked after 3 MFA failures")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")

    # Reset MFA failures on success
    user.mfa_failures = 0
    user.last_login_at = datetime.now(tz=timezone.utc)
    user.last_login_ip = request.client.host if request.client else None

    # Create session
    session_id = uuid4()
    access_token = create_access_token(
        user_id=user.id,
        institution=user.institution.code if user.institution else "UNKNOWN",
        role=user.role.value,
        clearance=user.clearance_level.value,
        session_id=session_id,
    )
    refresh_token = create_refresh_token(user_id=user.id, session_id=session_id)

    db.add(UserSession(
        id=session_id,
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        device_id=body.device_id,
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(tz=timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))

    await _audit(db, "AUTH_LOGIN", user.id, "LOGIN", "Successful login")
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")

    token_hash = hash_token(body.refresh_token)
    result = await db.execute(
        select(UserSession).where(
            UserSession.token_hash == token_hash,
            UserSession.revoked == False,
            UserSession.expires_at > datetime.now(tz=timezone.utc),
        )
    )
    session: UserSession | None = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or revoked")

    result = await db.execute(select(User).where(User.id == session.user_id, User.active == True))
    user: User | None = result.scalar_one_or_none()
    if not user or user.locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    new_session_id = uuid4()
    access_token = create_access_token(
        user_id=user.id,
        institution=user.institution.code if user.institution else "UNKNOWN",
        role=user.role.value,
        clearance=user.clearance_level.value,
        session_id=new_session_id,
    )
    new_refresh = create_refresh_token(user_id=user.id, session_id=new_session_id)

    # Rotate session
    session.revoked = True
    session.revoked_at = datetime.now(tz=timezone.utc)
    db.add(UserSession(
        id=new_session_id,
        user_id=user.id,
        token_hash=hash_token(new_refresh),
        device_id=session.device_id,
        expires_at=datetime.now(tz=timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: RefreshRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token_hash = hash_token(body.refresh_token)
    result = await db.execute(select(UserSession).where(UserSession.token_hash == token_hash))
    session = result.scalar_one_or_none()
    if session:
        session.revoked = True
        session.revoked_at = datetime.now(tz=timezone.utc)
        await _audit(db, "AUTH_LOGOUT", user.user_id, "LOGOUT", "User logged out")
        await db.commit()
    return MessageResponse(message="Logged out successfully")


@router.post("/mfa/setup", response_model=TOTPSetupResponse)
async def setup_mfa(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user.user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    secret = generate_totp_secret()
    db_user.totp_secret = secret
    await _audit(db, "MFA_SETUP", user.user_id, "UPDATE", "TOTP secret configured")
    await db.commit()

    return TOTPSetupResponse(
        totp_uri=get_totp_uri(secret, db_user.email),
        secret=secret,
    )


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    actor: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not actor.has_permission("revocation:any") and not actor.is_niss():
        raise HTTPException(status_code=403, detail="Insufficient permissions to create users")

    db_user = User(
        institution_id=body.institution_id,
        role=body.role,
        clearance_level=body.clearance_level,
        badge_number=body.badge_number,
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
    )
    db.add(db_user)
    await _audit(db, "USER_CREATED", actor.user_id, "CREATE", f"User {body.badge_number} created")
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def _audit(db: AsyncSession, event_type: str, actor_id, action: str, notes: str):
    from uuid import UUID
    try:
        actor_uuid = UUID(str(actor_id)) if actor_id else None
    except Exception:
        actor_uuid = None
    db.add(AuditLog(
        event_type=event_type,
        actor_id=actor_uuid,
        action=action,
        justification=notes,
    ))
