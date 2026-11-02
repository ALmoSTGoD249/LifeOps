from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import AuthSession, User
from app.security import COOKIE, lookup_session

SAFE = {"GET", "HEAD", "OPTIONS"}


def current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    s = lookup_session(db, request.cookies.get(COOKIE))
    if not s:
        raise HTTPException(401, "Not authenticated")
    if request.method not in SAFE and request.headers.get("x-csrf-token") != s.csrf_token:
        raise HTTPException(403, "CSRF token missing or invalid")
    return s


def current_user(s: AuthSession = Depends(current_session)) -> User:
    return s.user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role.name != "admin":
        raise HTTPException(403, "Administrator access required")
    return user
