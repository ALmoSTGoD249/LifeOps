"""Idempotent first-run seeding: roles, default household, initial admin from env."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models_incidents import IncidentCategory, PriorityMatrix
from app.services.incidents import DEFAULT_CATEGORIES, DEFAULT_MATRIX
from app.models import Household, HouseholdMember, Role, User, UserPreference
from app.security import hash_password
from app.services.catalog_seed import seed_catalog
from app.services.household_seed import seed_household_reference
from app.services.audit import log_activity


def seed(db: Session) -> None:
    for name, desc in (("admin", "Full administrative access"), ("user", "Standard household member")):
        if not db.scalar(select(Role).where(Role.name == name)):
            db.add(Role(name=name, description=desc))
    db.flush()
    if not db.scalar(select(PriorityMatrix)):
        db.add_all(PriorityMatrix(impact=i, urgency=u, priority=p) for (i, u), p in DEFAULT_MATRIX.items())
    if not db.scalar(select(IncidentCategory)):
        for n, (name, subs) in enumerate(DEFAULT_CATEGORIES.items()):
            parent = IncidentCategory(name=name, sort_order=n)
            db.add(parent)
            db.flush()
            db.add_all(IncidentCategory(name=sn, parent_id=parent.id, sort_order=k) for k, sn in enumerate(subs))
    db.flush()
    seed_catalog(db)
    seed_household_reference(db)
    db.flush()
    hh = db.scalar(select(Household))
    if not hh:
        hh = Household(name="Our Home")
        db.add(hh)
        db.flush()
    s = get_settings()
    if s.admin_email and s.admin_password and not db.scalar(select(User)):
        role = db.scalar(select(Role).where(Role.name == "admin"))
        u = User(email=s.admin_email.lower(), full_name=s.admin_name,
                 password_hash=hash_password(s.admin_password), role_id=role.id)
        db.add(u)
        db.flush()
        db.add(HouseholdMember(household_id=hh.id, user_id=u.id))
        db.add(UserPreference(user_id=u.id))
        log_activity(db, None, "bootstrap_admin_created", "user", u.id)
    db.commit()
