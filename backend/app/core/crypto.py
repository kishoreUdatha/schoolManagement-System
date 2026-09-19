"""Symmetric encryption for secrets we must store and read back (payment
gateway secrets). The key is derived from SECRET_KEY, so rotating SECRET_KEY
means re-entering those secrets."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(f"sms-secrets:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored secret can't be decrypted (SECRET_KEY changed?)") from exc
