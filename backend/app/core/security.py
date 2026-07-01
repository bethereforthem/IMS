"""
Authentication, JWT, MFA, and password security utilities.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import pyotp
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

CLEARANCE_RANK = {
    "UNCLASSIFIED": 0,
    "CONFIDENTIAL": 1,
    "SECRET": 2,
    "TOP_SECRET": 3,
}


# ---- Password ----

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---- National ID hash (privacy-preserving) ----

def hash_national_id(national_id: str) -> str:
    """SHA-256 of the national ID number. Never store plaintext NID."""
    normalized = national_id.strip().replace(" ", "").upper()
    return hashlib.sha256(normalized.encode()).hexdigest()


# ---- SHA-256 for evidence integrity ----

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---- JWT ----

def create_access_token(
    user_id: UUID,
    institution: str,
    role: str,
    clearance: str,
    session_id: UUID,
) -> str:
    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "institution": institution,
        "role": role,
        "clearance": clearance,
        "session_id": str(session_id),
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def create_refresh_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(tz=timezone.utc)
    expire = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "session_id": str(session_id),
        "iat": now,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])


def hash_token(token: str) -> str:
    """Store only the hash of tokens in the database."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---- TOTP (RFC 6238) ----

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, user_email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=user_email, issuer_name="IMS Rwanda")


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


# ---- Clearance Comparison ----

def has_sufficient_clearance(user_clearance: str, required: str) -> bool:
    return CLEARANCE_RANK.get(user_clearance, -1) >= CLEARANCE_RANK.get(required, 999)


def get_clearance_rank(clearance: str) -> int:
    return CLEARANCE_RANK.get(clearance, -1)


# ---- Secure token generation ----

def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
