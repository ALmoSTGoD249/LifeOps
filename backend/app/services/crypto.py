import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from app.config import get_settings


def _fernet() -> Fernet:
    s = get_settings()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256((s.encryption_key or s.secret_key).encode()).digest()))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        raise ValueError("Stored secret cannot be decrypted. Was SECRET_KEY / ENCRYPTION_KEY changed?")
