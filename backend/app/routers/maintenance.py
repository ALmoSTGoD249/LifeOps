import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user
from app.models import User, utcnow
from app.models_assets import Asset
from app.models_maintenance import MaintenanceChecklistItem, MaintenanceRecord, MaintenanceSchedule
from app.routers.incidents import _brief, _user
from app.schemas_household import SchedulePatch, ScheduleIn
from app.services import maintenance as svc
from app.services.audit import activity_for, log_activity, next_number

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


def out(db: Session, s: MaintenanceSchedule, full: bool = False) -> dict:
    t = svc.active_task(db, s)
    d = {"id": s.id, "number": s.number, "name": s.name, "description": s.description, "asset": {"number": s.asset.number, "name": s.asset.name} if s.asset else None,
         "frequency": s.frequency, "interval": s.interval, "next_due": s.next_due, "lead_days": s.lead_days, "from_completion": s.from_completion, "priority": s.priority,
         "assigned_to": _brief(s.assigned_to), "is_active": s.is_active, "last_completed_at": s.last_completed_at, "status": svc.status_of(s),
         "current_task": {"number": t.number, "state": t.state, "due_date": t.due_date} if t else None, "checklist": [c.text for c in s.checklist]}
    return d


def get_sched(db: Session, number: str) -> MaintenanceSchedule:
    s = db.scalar(select(MaintenanceSchedule).where(MaintenanceSchedule.number == number.upper()))
    if not s:
        raise HTTPException(404, "Maintenance schedule not found")
    return s


def _asset(db: Session, number: str | None) -> Asset | None:
    if not number:
        return None
    a = db.scalar(select(Asset).where(Asset.number == number.upper()))
    if not a:
        raise HTTPException(422, f"Asset {number} does not exist")
    return a


def _set_checklist(s: MaintenanceSchedule, items: list[str]) -> None:
    s.checklist.clear()
    for n, t in enumerate(x.strip()[:200] for x in items if x.strip()):
        s.checklist.append(MaintenanceChecklistItem(text=t, sort_order=n))


@router.get("/schedules")
def list_schedules(status: str = "active", asset: str | None = None, assigned_to: str | None = None, q: str | None = Query(None, max_length=100),
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    conds = []
    if asset:
        conds.append(MaintenanceSchedule.asset_id == select(Asset.id).where(Asset.number == asset.upper()).scalar_subquery())
    if assigned_to:
        try:
            conds.append(MaintenanceSchedule.assigned_to_id == (user.id if assigned_to == "me" else uuid.UUID(assigned_to)))
        except ValueError:
            raise HTTPException(422, "Invalid assigned_to")
    if q:
        conds.append(MaintenanceSchedule.name.ilike(f"%{q.strip()}%"))
    if status not in ("active", "all", "overdue", "upcoming", "inactive"):
        raise HTTPException(422, "Unknown status filter")
    rows = db.scalars(select(MaintenanceSchedule).where(*conds).order_by(MaintenanceSchedule.next_due)).unique().all()
    res = [out(db, s) for s in rows]
    if status == "active":
        res = [r for r in res if r["is_active"]]
    elif status == "overdue":
        res = [r for r in res if r["status"] == "overdue"]
    elif status == "upcoming":
        res = [r for r in res if r["status"] in ("due_soon", "ok") and r["is_active"]]
    elif status == "inactive":
        res = [r for r in res if not r["is_active"]]
    return res


@router.post("/schedules", status_code=201)
def create(body: ScheduleIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    asset = _asset(db, body.asset_number)
    _user(db, body.assigned_to_id)
    s = MaintenanceSchedule(number=next_number(db, "MNT"), name=body.name.strip(), description=body.description, asset_id=asset.id if asset else None, frequency=body.frequency,
                            interval=body.interval, next_due=body.first_due, lead_days=body.lead_days, from_completion=body.from_completion, priority=body.priority,
                            assigned_to_id=body.assigned_to_id, created_by_id=user.id, is_active=body.is_active)
    db.add(s)
    db.flush()
    _set_checklist(s, body.checklist)
    log_activity(db, user, "created", "maintenance", s.id, {"number": s.number, "name": s.name})
    if asset:
        log_activity(db, user, "schedule_added", "asset", asset.id, {"schedule": s.number, "name": s.name})
    db.flush()
    svc.generate_due_tasks(db)
    db.commit()
    db.refresh(s)
    return out(db, s, True)


@router.get("/schedules/{number}")
def detail(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    s = get_sched(db, number)
    recs = db.scalars(select(MaintenanceRecord).where(MaintenanceRecord.schedule_id == s.id).order_by(MaintenanceRecord.completed_at.desc()).limit(50)).unique().all()
    return {**out(db, s, True), "records": [{"id": r.id, "outcome": r.outcome, "due_date": r.due_date, "completed_at": r.completed_at, "completed_by": _brief(r.completed_by), "notes": r.notes} for r in recs]}


@router.patch("/schedules/{number}")
def update(number: str, body: SchedulePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_sched(db, number)
    ch = body.model_dump(exclude_unset=True)
    for k in ("name", "frequency", "interval", "next_due", "lead_days", "priority", "from_completion", "is_active"):
        if k in ch and ch[k] is None:
            raise HTTPException(422, f"{k} cannot be empty")
    if "assigned_to_id" in ch:
        _user(db, ch["assigned_to_id"])
    checklist = ch.pop("checklist", None)
    asset = None
    if "asset_number" in ch:
        asset = _asset(db, ch.pop("asset_number"))
        ch["asset_id"] = asset.id if asset else None
    old_asset = s.asset.number if s.asset else None
    diff = {}
    for k, v in ch.items():
        cur = getattr(s, k)
        if cur == v:
            continue
        if k not in ("assigned_to_id", "asset_id"):
            diff[k] = {"from": cur.isoformat() if hasattr(cur, "isoformat") else cur, "to": v.isoformat() if hasattr(v, "isoformat") else v}
        setattr(s, k, v)
    if checklist is not None and checklist != [c.text for c in s.checklist]:
        _set_checklist(s, checklist)
        diff["checklist"] = {"from": "(changed)", "to": "(changed)"}
    db.flush()
    db.refresh(s)
    if (s.asset.number if s.asset else None) != old_asset:
        diff["asset"] = {"from": old_asset, "to": s.asset.number if s.asset else None}
    if diff:
        log_activity(db, user, "updated", "maintenance", s.id, diff)
    svc.generate_due_tasks(db)
    db.commit()
    db.refresh(s)
    return out(db, s, True)


@router.delete("/schedules/{number}", status_code=204)
def delete(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = get_sched(db, number)
    if db.scalar(select(func.count()).select_from(MaintenanceRecord).where(MaintenanceRecord.schedule_id == s.id)):
        raise HTTPException(409, "This schedule has history, so it cannot be deleted. Deactivate it instead.")
    log_activity(db, user, "deleted", "maintenance", s.id, {"name": s.name})
    db.delete(s)
    db.commit()


@router.get("/schedules/{number}/activity")
def timeline(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return activity_for(db, "maintenance", get_sched(db, number).id)


@router.get("/records")
def records(days: int = Query(90, ge=1, le=3650), limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db), _: User = Depends(current_user)):
    since = utcnow() - timedelta(days=days)
    rows = db.execute(select(MaintenanceRecord, MaintenanceSchedule).join(MaintenanceSchedule, MaintenanceSchedule.id == MaintenanceRecord.schedule_id)
                      .where(MaintenanceRecord.completed_at >= since).order_by(MaintenanceRecord.completed_at.desc()).limit(limit)).unique().all()
    return [{"id": r.id, "schedule_number": s.number, "schedule_name": s.name, "asset": {"number": s.asset.number, "name": s.asset.name} if s.asset else None,
             "outcome": r.outcome, "due_date": r.due_date, "completed_at": r.completed_at, "completed_by": _brief(r.completed_by), "notes": r.notes} for r, s in rows]


@router.post("/generate")
def generate(db: Session = Depends(get_db), _: User = Depends(current_user)):
    made = svc.generate_due_tasks(db)
    db.commit()
    return {"created": [t.number for t in made]}
