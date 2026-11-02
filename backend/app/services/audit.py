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
