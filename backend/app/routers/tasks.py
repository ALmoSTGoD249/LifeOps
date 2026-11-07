import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload
from app.db import get_db
from app.deps import current_user
from app.models import User, utcnow
from app.models_incidents import Attachment, Incident
from app.models_tasks import Task, TaskChecklistItem, TaskComment, TaskDependency
from app.routers.incidents import _brief, _user
from app.schemas_tasks import (ChecklistIn, ChecklistPatch, DependencyIn, TaskCommentIn, TaskCreateIn, TaskTransitionIn, TaskUpdateIn)
from app.services import tasks as svc
from app.services.attachments import save_upload
from app.services.audit import activity_for, log_activity, next_number

router = APIRouter(tags=["tasks"])
SORTS = {"due_date": Task.due_date, "priority": Task.priority, "updated_at": Task.updated_at, "created_at": Task.created_at,
         "number": Task.number, "title": Task.title, "state": Task.state}


def _get(db: Session, number: str) -> Task:
    t = db.scalar(select(Task).where(Task.number == number.upper()))
    if not t:
        raise HTTPException(404, "Task not found")
    return t


def _editable(t: Task) -> None:
    if t.state in ("completed", "cancelled"):
        raise HTTPException(409, f"A {t.state} task cannot be modified. Reopen it first.")


def _incident(db: Session, number: str | None) -> Incident | None:
    if not number:
        return None
    inc = db.scalar(select(Incident).where(Incident.number == number.upper()))
    if not inc:
        raise HTTPException(422, f"Incident {number} does not exist")
    return inc


def _base(t: Task) -> dict:
    return {"id": t.id, "number": t.number, "title": t.title, "description": t.description, "category": t.category, "priority": t.priority,
            "state": t.state, "blocked_reason": t.blocked_reason, "assigned_to": _brief(t.assigned_to), "created_by": _brief(t.created_by),
            "due_date": t.due_date, "completed_at": t.completed_at, "created_at": t.created_at, "updated_at": t.updated_at, "source": t.source,
            "parent": ({"type": "incident", "number": t.incident.number, "title": t.incident.short_description} if t.incident else
                       {"type": "maintenance", "number": t.maintenance_schedule.number, "title": t.maintenance_schedule.name} if t.maintenance_schedule else None),
            "recurrence": {"frequency": t.recurrence_frequency, "interval": t.recurrence_interval} if t.recurrence_frequency else None}


def _decorate(db: Session, tasks: list[Task]) -> list[dict]:
    ids = [t.id for t in tasks]
    counts = {r[0]: (r[1], r[2] or 0) for r in db.execute(
        select(TaskChecklistItem.task_id, func.count(), func.sum(case((TaskChecklistItem.done, 1), else_=0)))
        .where(TaskChecklistItem.task_id.in_(ids)).group_by(TaskChecklistItem.task_id))} if ids else {}
    blocked = set(db.scalars(
        select(TaskDependency.task_id).join(Task, Task.id == TaskDependency.depends_on_id)
        .where(TaskDependency.task_id.in_(ids), Task.state.notin_(["completed", "cancelled"])))) if ids else set()
    return [{**_base(t), "checklist_total": counts.get(t.id, (0, 0))[0], "checklist_done": int(counts.get(t.id, (0, 0))[1]), "is_blocked_by_dependency": t.id in blocked} for t in tasks]


def _detail(db: Session, t: Task) -> dict:
    d = _decorate(db, [t])[0]
    d["checklist"] = [{"id": i.id, "text": i.text, "done": i.done} for i in db.scalars(select(TaskChecklistItem).where(TaskChecklistItem.task_id == t.id).order_by(TaskChecklistItem.sort_order, TaskChecklistItem.id))]
    summ = lambda x: {"number": x.number, "title": x.title, "state": x.state}  # noqa: E731
    d["blocked_by"] = [summ(x) for x in db.scalars(select(Task).join(TaskDependency, TaskDependency.depends_on_id == Task.id).where(TaskDependency.task_id == t.id).order_by(Task.number))]
    d["blocks"] = [summ(x) for x in db.scalars(select(Task).join(TaskDependency, TaskDependency.task_id == Task.id).where(TaskDependency.depends_on_id == t.id).order_by(Task.number))]
    return d


@router.get("/tasks")
def list_tasks(scope: str = "all", state: str | None = None, assigned_to: str | None = None, priority: int | None = Query(None, ge=1, le=4),
               incident: str | None = Query(None, max_length=20), q: str | None = Query(None, max_length=100), due_from: str | None = None, due_to: str | None = None,
               sort: str = "due_date", order: str = "asc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    if sort not in SORTS:
        raise HTTPException(422, f"Unknown sort field. Use one of: {', '.join(SORTS)}")
    now, active = utcnow(), Task.state.in_(svc.ACTIVE)
    conds = []
    if scope == "mine":
        conds += [Task.assigned_to_id == user.id, active]
    elif scope == "by_me":
        conds += [Task.created_by_id == user.id, or_(Task.assigned_to_id != user.id, Task.assigned_to_id.is_(None)), active]
    elif scope == "overdue":
        conds += [Task.due_date < now, active]
    elif scope == "upcoming":
        conds += [Task.due_date >= now, Task.due_date <= now + timedelta(days=7), active]
    elif scope == "unassigned":
        conds += [Task.assigned_to_id.is_(None), active]
    elif scope != "all":
        raise HTTPException(422, "Unknown scope")
    if state:
        conds.append(Task.state.in_(svc.ACTIVE if state == "active" else [s for s in state.split(",") if s in svc.STATES]))
    if assigned_to:
        try:
            conds.append(Task.assigned_to_id == (user.id if assigned_to == "me" else uuid.UUID(assigned_to)))
        except ValueError:
            raise HTTPException(422, "Invalid assigned_to")
    if priority:
        conds.append(Task.priority == priority)
    if incident:
        conds.append(Task.incident_id == select(Incident.id).where(Incident.number == incident.upper()).scalar_subquery())
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Task.number.ilike(like), Task.title.ilike(like), Task.description.ilike(like)))
    try:
        from datetime import datetime
        if due_from:
            conds.append(Task.due_date >= datetime.fromisoformat(due_from.replace("Z", "+00:00")))
        if due_to:
            conds.append(Task.due_date < datetime.fromisoformat(due_to.replace("Z", "+00:00")))
    except ValueError:
        raise HTTPException(422, "Invalid date filter")
    col = SORTS[sort]
    total = db.scalar(select(func.count()).select_from(Task).where(*conds)) or 0
    rows = db.scalars(select(Task).options(selectinload(Task.incident), selectinload(Task.maintenance_schedule)).where(*conds)
                      .order_by((col.asc() if order == "asc" else col.desc()).nulls_last(), Task.number.desc())
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": _decorate(db, list(rows)), "total": total}


@router.post("/tasks", status_code=201)
def create_task(body: TaskCreateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _user(db, body.assigned_to_id)
    inc = _incident(db, body.incident_number)
    t = Task(number=next_number(db, "TASK"), title=body.title.strip(), description=body.description, category=body.category.strip(), priority=body.priority,
             assigned_to_id=body.assigned_to_id, created_by_id=user.id, due_date=body.due_date, incident_id=inc.id if inc else None,
             source="incident" if inc else "manual", recurrence_frequency=body.recurrence_frequency, recurrence_interval=body.recurrence_interval)
    db.add(t)
    db.flush()
    for n, text in enumerate(x.strip() for x in body.checklist if x.strip()):
        db.add(TaskChecklistItem(task_id=t.id, text=text[:200], sort_order=n))
    log_activity(db, user, "created", "task", t.id, {"number": t.number, "parent": inc.number if inc else None})
    if t.assigned_to_id:
        db.refresh(t)
        log_activity(db, user, "assigned", "task", t.id, {"assigned_to": {"from": None, "to": t.assigned_to.full_name}})
    if inc:
        log_activity(db, user, "task_linked", "incident", inc.id, {"task": t.number})
    db.commit()
    db.refresh(t)
    return _detail(db, t)


@router.get("/tasks/{number}")
def get_task(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return _detail(db, _get(db, number))


@router.patch("/tasks/{number}")
def update_task(number: str, body: TaskUpdateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    ch = body.model_dump(exclude_unset=True)
    for k in ("title", "priority", "recurrence_interval"):
        if k in ch and ch[k] is None:
            raise HTTPException(422, f"{k} cannot be empty")
    old_assignee = t.assigned_to.full_name if t.assigned_to else None
    if "assigned_to_id" in ch:
        _user(db, ch["assigned_to_id"])
    diff = {}
    if "incident_number" in ch:
        inc = _incident(db, ch.pop("incident_number"))
        new_id = inc.id if inc else None
        if new_id != t.incident_id:
            diff["parent"] = {"from": t.incident.number if t.incident else None, "to": inc.number if inc else None}
            t.incident_id, t.source = new_id, ("incident" if inc else "manual")
    for k, v in ch.items():
        cur = getattr(t, k)
        if cur != v:
            if k != "assigned_to_id":
                diff[k] = {"from": cur.isoformat() if hasattr(cur, "isoformat") else cur, "to": v.isoformat() if hasattr(v, "isoformat") else v}
            setattr(t, k, v)
    db.flush()
    db.refresh(t)
    if diff:
        log_activity(db, user, "updated", "task", t.id, diff)
    new_assignee = t.assigned_to.full_name if t.assigned_to else None
    if new_assignee != old_assignee:
        log_activity(db, user, "assigned" if new_assignee else "unassigned", "task", t.id, {"assigned_to": {"from": old_assignee, "to": new_assignee}})
    db.commit()
    db.refresh(t)
    return _detail(db, t)


@router.post("/tasks/{number}/transition")
def transition(number: str, body: TaskTransitionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    try:
        follow_up = svc.transition(db, user, t, body.to, body.blocked_reason)
    except svc.Conflict as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    db.refresh(t)
    return {**_detail(db, t), "follow_up": follow_up.number if follow_up else None}


# ---- checklist -------------------------------------------------------------
@router.post("/tasks/{number}/checklist", status_code=201)
def add_item(number: str, body: ChecklistIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    nxt = (db.scalar(select(func.max(TaskChecklistItem.sort_order)).where(TaskChecklistItem.task_id == t.id)) or 0) + 1
    item = TaskChecklistItem(task_id=t.id, text=body.text.strip(), sort_order=nxt)
    db.add(item)
    db.flush()
    log_activity(db, user, "checklist_added", "task", t.id, {"item": item.text})
    db.commit()
    return {"id": item.id, "text": item.text, "done": item.done}


def _item(db: Session, t: Task, item_id: uuid.UUID) -> TaskChecklistItem:
    i = db.get(TaskChecklistItem, item_id)
    if not i or i.task_id != t.id:
        raise HTTPException(404, "Checklist item not found")
    return i


@router.patch("/tasks/{number}/checklist/{item_id}")
def patch_item(number: str, item_id: uuid.UUID, body: ChecklistPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    i = _item(db, t, item_id)
    ch = body.model_dump(exclude_unset=True)
    if "text" in ch and ch["text"] is not None:
        i.text = ch["text"].strip()
    if "done" in ch and ch["done"] is not None and ch["done"] != i.done:
        i.done = ch["done"]
        log_activity(db, user, "checklist_done" if i.done else "checklist_undone", "task", t.id, {"item": i.text})
    db.commit()
    return {"id": i.id, "text": i.text, "done": i.done}


@router.delete("/tasks/{number}/checklist/{item_id}", status_code=204)
def delete_item(number: str, item_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    i = _item(db, t, item_id)
    log_activity(db, user, "checklist_removed", "task", t.id, {"item": i.text})
    db.delete(i)
    db.commit()


# ---- dependencies ----------------------------------------------------------
@router.post("/tasks/{number}/dependencies", status_code=201)
def add_dependency(number: str, body: DependencyIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    other = db.scalar(select(Task).where(Task.number == body.depends_on.upper()))
    if not other:
        raise HTTPException(422, f"Task {body.depends_on} does not exist")
    if other.id == t.id:
        raise HTTPException(422, "A task cannot depend on itself")
    if db.get(TaskDependency, (t.id, other.id)):
        raise HTTPException(409, "Dependency already exists")
    if svc.would_cycle(db, t.id, other.id):
        raise HTTPException(422, f"{other.number} already depends on {t.number}, so this would create a loop")
    db.add(TaskDependency(task_id=t.id, depends_on_id=other.id))
    log_activity(db, user, "dependency_added", "task", t.id, {"depends_on": other.number})
    db.commit()
    return _detail(db, t)


@router.delete("/tasks/{number}/dependencies/{other}")
def remove_dependency(number: str, other: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    _editable(t)
    o = _get(db, other)
    dep = db.get(TaskDependency, (t.id, o.id))
    if not dep:
        raise HTTPException(404, "Dependency not found")
    db.delete(dep)
    log_activity(db, user, "dependency_removed", "task", t.id, {"depends_on": o.number})
    db.commit()
    return _detail(db, t)


# ---- comments, timeline, attachments ---------------------------------------
@router.post("/tasks/{number}/comments", status_code=201)
def add_comment(number: str, body: TaskCommentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    c = TaskComment(task_id=t.id, author_id=user.id, body=body.body.strip())
    db.add(c)
    db.flush()
    log_activity(db, user, "commented", "task", t.id, {"comment_id": str(c.id)})
    t.updated_at = c.created_at
    db.commit()
    return {"id": c.id}


@router.get("/tasks/{number}/activity")
def timeline(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    t = _get(db, number)
    bodies = {str(c.id): c for c in db.scalars(select(TaskComment).where(TaskComment.task_id == t.id))}
    return [{**a, "comment": {"kind": "comment", "body": bodies[a["details"]["comment_id"]].body} if a["details"].get("comment_id") in bodies else None}
            for a in activity_for(db, "task", t.id)]


@router.get("/tasks/{number}/attachments")
def list_attachments(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    t = _get(db, number)
    rows = db.scalars(select(Attachment).where(Attachment.record_type == "task", Attachment.record_id == str(t.id)).order_by(Attachment.created_at)).all()
    return [{"id": a.id, "name": a.original_name, "size": a.size, "mime": a.mime, "created_at": a.created_at} for a in rows]


@router.post("/tasks/{number}/attachments", status_code=201)
async def upload(number: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get(db, number)
    att = await save_upload(db, user, "task", t.id, file)
    db.commit()
    return {"id": att.id, "name": att.original_name, "size": att.size, "mime": att.mime, "created_at": att.created_at}
