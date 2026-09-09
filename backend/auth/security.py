"""
Security primitives: password hashing and JWT encode/decode.

Deliberately framework- and DB-agnostic — these functions don't know about
FastAPI or SQLAlchemy. Business logic (e.g. "look up a user and check their
password") lives in services/auth_service.py, which uses these as building
blocks. This separation keeps the crypto logic easy to unit test in
isolation.
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from config.settings import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password for storage. Never store plain passwords."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, role: str, expires_minutes: int | None = None) -> str:
    """
    Create a signed JWT.

    subject: the user_id (as a string) — becomes the "sub" claim.
    role:    the user's role name (e.g. "Admin") — lets protected routes
             check permissions without a DB lookup on every request.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT's signature and expiry.
    Raises jose.JWTError if the token is invalid, tampered with, or expired.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


__all__ = ["hash_password", "verify_password", "create_access_token", "decode_access_token", "JWTError"]
