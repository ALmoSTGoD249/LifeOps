from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import HouseholdMember, Household, Role, User, UserPreference
from app.schemas import (AdminUserUpdateIn, PreferencesIO, UserCreateIn, UserOut, UserUpdateIn)
from app.security import hash_password
from app.services.audit import diff_fields, log_activity

router = APIRouter(tags=["users"])


def _role(db: Session, name: str) -> Role:
    r = db.scalar(select(Role).where(Role.name == name))
    if not r:
        raise HTTPException(422, f"Unknown role '{name}'")
    return r


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(current_user)):
    # all household members can see each other (needed for assignment pickers)
    return [UserOut.of(u) for u in db.scalars(select(User).where(User.is_active).order_by(User.full_name))]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreateIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with this email already exists")
    u = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password),
             role_id=_role(db, body.role).id)
    db.add(u)
    db.flush()
    hh = db.scalar(select(Household))
    if hh:
        db.add(HouseholdMember(household_id=hh.id, user_id=u.id))
    db.add(UserPreference(user_id=u.id))
    log_activity(db, admin, "created", "user", u.id, {"email": email, "role": body.role})
    db.commit()
    db.refresh(u)
    return UserOut.of(u)


@router.patch("/users/me", response_model=UserOut)
def update_me(body: UserUpdateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    changes = body.model_dump(exclude_unset=True)
    old = {k: getattr(user, k) for k in changes}
    for k, v in changes.items():
        setattr(user, k, v)
    if d := diff_fields(old, changes):
        log_activity(db, user, "updated", "user", user.id, d)
    db.commit()
    return UserOut.of(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def admin_update_user(user_id: str, body: AdminUserUpdateIn, db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("is_active") is False and u.id == admin.id:
        raise HTTPException(400, "You cannot deactivate your own account")
    old = {"full_name": u.full_name, "avatar_url": u.avatar_url, "is_active": u.is_active, "role": u.role.name}
    if "role" in changes and changes["role"]:
        if u.id == admin.id and changes["role"] != "admin":
            raise HTTPException(400, "You cannot remove your own admin role")
        u.role_id = _role(db, changes["role"]).id
    for k in ("full_name", "avatar_url", "is_active"):
        if k in changes:
            setattr(u, k, changes[k])
    db.flush()
    db.refresh(u)
    new = {"full_name": u.full_name, "avatar_url": u.avatar_url, "is_active": u.is_active, "role": u.role.name}
    if d := diff_fields(old, new):
        log_activity(db, admin, "updated", "user", u.id, d)
    db.commit()
    return UserOut.of(u)


@router.get("/users/me/preferences", response_model=PreferencesIO)
def get_prefs(db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.get(UserPreference, user.id) or UserPreference(user_id=user.id)
    return PreferencesIO(theme=p.theme or "dark", sidebar_collapsed=bool(p.sidebar_collapsed),
                         dashboard_widgets=p.dashboard_widgets or {})


@router.put("/users/me/preferences", response_model=PreferencesIO)
def put_prefs(body: PreferencesIO, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.get(UserPreference, user.id)
    if not p:
        p = UserPreference(user_id=user.id)
        db.add(p)
    p.theme, p.sidebar_collapsed, p.dashboard_widgets = body.theme, body.sidebar_collapsed, body.dashboard_widgets
    db.commit()
    return body
