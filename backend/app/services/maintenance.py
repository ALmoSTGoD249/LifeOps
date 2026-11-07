"""Preventive maintenance: turn schedules into tasks, and tasks back into history."""
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import User, utcnow
from app.models_maintenance import MaintenanceRecord, MaintenanceSchedule
from app.models_tasks import Task, TaskChecklistItem
from app.services.audit import log_activity, next_number
from app.services.recurrence import next_due_after

ACTIVE_TASK = ("open", "in_progress", "blocked")


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def active_task(db: Session, s: MaintenanceSchedule) -> Task | None:
    return db.scalar(select(Task).where(Task.maintenance_schedule_id == s.id, Task.state.in_(ACTIVE_TASK)).order_by(Task.created_at.desc()))


def status_of(s: MaintenanceSchedule, now: datetime | None = None) -> str:
    now = now or utcnow()
    if not s.is_active:
        return "inactive"
    due = aware(s.next_due)
    if due < now:
        return "overdue"
    return "due_soon" if (due - now).days <= max(s.lead_days, 7) else "ok"


def generate_due_tasks(db: Session, now: datetime | None = None) -> list[Task]:
    """Create a task for every active schedule that is inside its lead window and has no open task.
    Idempotent: safe to run on a timer, on startup and on demand."""
    now = now or utcnow()
    made = []
    for s in db.scalars(select(MaintenanceSchedule).where(MaintenanceSchedule.is_active).with_for_update(skip_locked=True)).unique():
        from datetime import timedelta
        if aware(s.next_due) - timedelta(days=s.lead_days) > now or active_task(db, s):
            continue
        title = f"{s.name}" + (f" ({s.asset.name})" if s.asset else "")
        t = Task(number=next_number(db, "TASK"), title=title[:200], description=s.description, category="Maintenance", priority=s.priority,
                 assigned_to_id=s.assigned_to_id, created_by_id=s.created_by_id, due_date=s.next_due, source="maintenance", maintenance_schedule_id=s.id)
        db.add(t)
        db.flush()
        for n, c in enumerate(s.checklist):
            db.add(TaskChecklistItem(task_id=t.id, text=c.text, sort_order=n))
        log_activity(db, None, "created", "task", t.id, {"number": t.number, "generated_by": s.number})
        log_activity(db, None, "task_generated", "maintenance", s.id, {"task": t.number, "due": s.next_due.isoformat()})
        made.append(t)
    return made


def on_task_closed(db: Session, user: User, task: Task, outcome: str) -> None:
    """Called when a maintenance task is completed (history + next cycle) or cancelled (cycle skipped)."""
    s = db.get(MaintenanceSchedule, task.maintenance_schedule_id)
    if not s:
        return
    now = utcnow()
    done = db.scalars(select(TaskChecklistItem).where(TaskChecklistItem.task_id == task.id)).all()
    note = f"{sum(1 for i in done if i.done)}/{len(done)} checklist items done" if done else ""
    db.add(MaintenanceRecord(schedule_id=s.id, task_id=task.id, asset_id=s.asset_id, due_date=s.next_due, completed_at=now, completed_by_id=user.id, outcome=outcome, notes=note))
    base = now if (s.from_completion and outcome == "completed") else aware(s.next_due)
    old = s.next_due
    s.next_due = next_due_after(base, now, s.frequency, s.interval)
    if outcome == "completed":
        s.last_completed_at = now
    log_activity(db, user, "cycle_completed" if outcome == "completed" else "cycle_skipped", "maintenance", s.id,
                 {"task": task.number, "next_due": {"from": old.isoformat(), "to": s.next_due.isoformat()}})
    if s.asset_id:
        log_activity(db, user, "maintenance_done" if outcome == "completed" else "maintenance_skipped", "asset", s.asset_id, {"schedule": s.number, "name": s.name})
