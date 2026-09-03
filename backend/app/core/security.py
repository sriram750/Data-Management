import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.config import settings

# Enterprise Argon2id Password Hasher
ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    type=Type.ID
)


def hash_password(password: str) -> str:
    """Hash a password securely using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an Argon2id hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Check if the password hash needs rehashing due to parameter updates."""
    try:
        return ph.check_needs_rehash(hashed_password)
    except Exception:
        return True


def generate_session_token() -> Tuple[str, str]:
    """Generate a raw session token for the client and its SHA-256 hash for database storage.
    Returns (raw_token, token_hash)
    """
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_token(raw_token)
    return raw_token, token_hash


def hash_token(token: str) -> str:
    """Hash a token using SHA-256 for secure lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def calculate_session_expiration() -> datetime:
    """Calculate expiration datetime for a new session."""
    return datetime.now(timezone.utc) + timedelta(minutes=settings.SESSION_TIMEOUT_MINUTES)


def calculate_lockout_expiration() -> datetime:
    """Calculate lockout expiration datetime after excessive failed logins."""
    return datetime.now(timezone.utc) + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
