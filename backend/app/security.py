import hashlib
import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import AuthSession, User, utcnow

_ph = PasswordHasher()
COOKIE = "lifeops_session"


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    s = AuthSession(user_id=user.id, token_hash=_digest(token), csrf_token=secrets.token_urlsafe(24),
                    expires_at=utcnow() + timedelta(hours=get_settings().session_ttl_hours))
    db.add(s)
    db.flush()
    return token, s


def lookup_session(db: Session, token: str | None) -> AuthSession | None:
    if not token:
        return None
    s = db.scalar(select(AuthSession).where(AuthSession.token_hash == _digest(token)))
    if not s:
        return None
    exp = s.expires_at if s.expires_at.tzinfo else s.expires_at.replace(tzinfo=utcnow().tzinfo)
    if exp < utcnow() or not s.user.is_active:
        db.delete(s)
        db.commit()
        return None
    return s


def validate_password_strength(pw: str) -> None:
    if len(pw) < 10:
        raise ValueError("Password must be at least 10 characters")
