from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte limit; truncate defensively (standard practice).
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pw = plain.encode("utf-8")[:72]
    try:
        return bcrypt.checkpw(pw, hashed.encode("utf-8"))
    except ValueError:
        return False


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(
    subject: str | int,
    role: str,
    tenant_id: Optional[int] = None,
    school_id: Optional[int] = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return _encode(
        {
            "sub": str(subject),
            "role": role,
            "tenant_id": tenant_id,
            "school_id": school_id,
            "exp": expire,
            "type": "access",
        }
    )


def create_refresh_token(
    subject: str | int,
    role: str,
    tenant_id: Optional[int] = None,
    school_id: Optional[int] = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return _encode(
        {
            "sub": str(subject),
            "role": role,
            "tenant_id": tenant_id,
            "school_id": school_id,
            "exp": expire,
            "type": "refresh",
        }
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc
