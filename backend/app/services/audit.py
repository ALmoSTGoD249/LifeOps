from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import ActivityLog, RecordSequence, User


def log_activity(db: Session, user: User | None, action: str, record_type: str,
                 record_id, details: dict | None = None) -> None:
    db.add(ActivityLog(user_id=user.id if user else None, action=action,
                       record_type=record_type, record_id=str(record_id), details=details or {}))


def diff_fields(old: dict, new: dict) -> dict:
    return {k: {"from": old.get(k), "to": v} for k, v in new.items() if old.get(k) != v}


def next_number(db: Session, prefix: str) -> str:
    seq = db.get(RecordSequence, prefix, with_for_update=True)
    if seq is None:
        seq = RecordSequence(prefix=prefix, last_value=0)
        db.add(seq)
        db.flush()
    seq.last_value += 1
    db.flush()
    return f"{prefix}{seq.last_value:06d}"


def activity_for(db: Session, record_type: str, record_id) -> list[dict]:
    """Chronological timeline for one record, with the acting user's display name."""
    rows = db.execute(
        select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
        .where(ActivityLog.record_type == record_type, ActivityLog.record_id == str(record_id))
        .order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())
    ).all()
    return [{"id": str(a.id), "action": a.action, "user_name": name, "user_id": str(a.user_id) if a.user_id else None,
             "details": a.details or {}, "created_at": a.created_at} for a, name in rows]
