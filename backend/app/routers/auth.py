import time
from collections import defaultdict, deque
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.db import get_db
from app.deps import current_session
from app.models import AuthSession, User
from app.schemas import LoginIn, PasswordChangeIn, SessionOut, UserOut
from app.security import COOKIE, create_session, hash_password, verify_password
from app.services.audit import log_activity

router = APIRouter(prefix="/auth", tags=["auth"])
_attempts: dict[str, deque] = defaultdict(deque)  # per-process; Nginx limit_req is the second layer
_DUMMY = hash_password("timing-equalizer")


def _rate_limit(key: str) -> None:
    s = get_settings()
    q, now = _attempts[key], time.monotonic()
    while q and now - q[0] > s.login_rate_window_seconds:
        q.popleft()
    if len(q) >= s.login_rate_limit:
        raise HTTPException(429, "Too many login attempts. Try again later.")


def _set_cookie(resp: Response, token: str) -> None:
    s = get_settings()
    resp.set_cookie(COOKIE, token, httponly=True, secure=s.cookie_secure, samesite="lax",
                    max_age=s.session_ttl_hours * 3600, path="/")


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else '?'}:{body.email.lower()}"
    _rate_limit(key)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY)
    if not (user and ok and user.is_active):
        _attempts[key].append(time.monotonic())
        raise HTTPException(401, "Invalid email or password")
    _attempts.pop(key, None)
    token, sess = create_session(db, user)
    log_activity(db, user, "login", "user", user.id)
    db.commit()
    _set_cookie(response, token)
    return SessionOut(user=UserOut.of(user), csrf_token=sess.csrf_token)


@router.post("/logout", status_code=204)
def logout(response: Response, s: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    log_activity(db, s.user, "logout", "user", s.user.id)
    db.delete(s)
    db.commit()
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=SessionOut)
def me(s: AuthSession = Depends(current_session)):
    return SessionOut(user=UserOut.of(s.user), csrf_token=s.csrf_token)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChangeIn, s: AuthSession = Depends(current_session),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, s.user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    s.user.password_hash = hash_password(body.new_password)
    # revoke every other session for this user
    for other in db.scalars(select(AuthSession).where(AuthSession.user_id == s.user_id, AuthSession.id != s.id)):
        db.delete(other)
    log_activity(db, s.user, "password_changed", "user", s.user.id)
    db.commit()
