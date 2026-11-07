from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import User, utcnow
from app.models_tasks import Task, TaskChecklistItem, TaskDependency
from app.services.audit import log_activity, next_number
from app.services.recurrence import next_due_after

STATES = ["open", "in_progress", "blocked", "completed", "cancelled"]
ACTIVE = {"open", "in_progress", "blocked"}


class Conflict(ValueError):
    pass


def unmet_dependencies(db: Session, task: Task) -> list[Task]:
    rows = db.scalars(select(Task).join(TaskDependency, TaskDependency.depends_on_id == Task.id).where(TaskDependency.task_id == task.id))
    return [t for t in rows if t.state not in ("completed", "cancelled")]


def would_cycle(db: Session, task_id, depends_on_id) -> bool:
    """True if making task_id depend on depends_on_id creates a loop."""
    seen, stack = set(), [depends_on_id]
    while stack:
        cur = stack.pop()
        if cur == task_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(db.scalars(select(TaskDependency.depends_on_id).where(TaskDependency.task_id == cur)))
    return False


def spawn_next(db: Session, user: User, t: Task) -> Task | None:
    if not t.recurrence_frequency or t.recurrence_spawned:
        return None
    now = utcnow()
    base = t.due_date or now
    if base.tzinfo is None:
        base = base.replace(tzinfo=now.tzinfo)
    n = Task(number=next_number(db, "TASK"), title=t.title, description=t.description, category=t.category, priority=t.priority,
             assigned_to_id=t.assigned_to_id, created_by_id=t.created_by_id, source=t.source, incident_id=None,
             due_date=next_due_after(base, now, t.recurrence_frequency, t.recurrence_interval),
             recurrence_frequency=t.recurrence_frequency, recurrence_interval=t.recurrence_interval)
    db.add(n)
    db.flush()
    for i in db.scalars(select(TaskChecklistItem).where(TaskChecklistItem.task_id == t.id).order_by(TaskChecklistItem.sort_order)):
        db.add(TaskChecklistItem(task_id=n.id, text=i.text, done=False, sort_order=i.sort_order))
    t.recurrence_spawned = True
    log_activity(db, user, "created", "task", n.id, {"number": n.number, "recurred_from": t.number})
    log_activity(db, user, "recurrence_generated", "task", t.id, {"next": n.number})
    return n


def transition(db: Session, user: User, t: Task, to: str, blocked_reason: str | None = None) -> Task | None:
    """Returns the follow-up task if completing a recurring task generated one."""
    if to not in STATES or to == t.state:
        raise ValueError(f"Task is already {t.state}" if to == t.state else "Unknown state")
    if t.state in ("completed", "cancelled") and to != "open":
        raise Conflict(f"A {t.state} task can only be reopened")
    if t.maintenance_schedule_id and t.state in ("completed", "cancelled"):
        raise Conflict("Maintenance tasks cannot be reopened. The next cycle is generated from the schedule.")
    if to in ("in_progress", "completed"):
        unmet = unmet_dependencies(db, t)
        if unmet:
            raise Conflict("Blocked by unfinished task(s): " + ", ".join(u.number for u in unmet))
    old = t.state
    t.state = to
    details: dict = {"state": {"from": old, "to": to}}
    if to == "blocked":
        t.blocked_reason = (blocked_reason or "").strip() or None
        details["blocked_reason"] = t.blocked_reason
    else:
        t.blocked_reason = None
    t.completed_at = utcnow() if to == "completed" else None
    log_activity(db, user, {"completed": "completed", "cancelled": "cancelled"}.get(to, "reopened" if old in ("completed", "cancelled") else "state_changed"),
                 "task", t.id, details)
    if t.maintenance_schedule_id and to in ("completed", "cancelled"):
        from app.services.maintenance import on_task_closed
        on_task_closed(db, user, t, "completed" if to == "completed" else "skipped")
    return spawn_next(db, user, t) if to == "completed" else None
