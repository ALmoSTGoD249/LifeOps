import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.models_assets import Asset, AssetCategory
from app.models_incidents import Attachment, Incident
from app.models_maintenance import MaintenanceRecord, MaintenanceSchedule
from app.routers.incidents import _brief, _user
from app.schemas_household import AssetIn, AssetPatch
from app.services.attachments import save_upload
from app.services.audit import activity_for, log_activity, next_number

router = APIRouter(tags=["assets"])
SORTS = {"number": Asset.number, "name": Asset.name, "warranty_expires": Asset.warranty_expires, "purchase_date": Asset.purchase_date, "updated_at": Asset.updated_at, "status": Asset.status}


def warranty(a: Asset) -> tuple[str, int | None]:
    if not a.warranty_expires:
        return "none", None
    days = (a.warranty_expires - date.today()).days
    return ("expired" if days < 0 else "expiring" if days <= 60 else "active"), days


def out(a: Asset) -> dict:
    ws, days = warranty(a)
    return {"id": a.id, "number": a.number, "name": a.name, "category": {"id": a.category.id, "name": a.category.name} if a.category else None,
            "manufacturer": a.manufacturer, "model": a.model, "serial_number": a.serial_number, "purchase_date": a.purchase_date, "warranty_expires": a.warranty_expires,
            "purchase_price": float(a.purchase_price) if a.purchase_price is not None else None, "location": a.location, "owner": _brief(a.owner),
            "condition": a.condition, "status": a.status, "notes": a.notes, "warranty_status": ws, "warranty_days_left": days, "created_at": a.created_at, "updated_at": a.updated_at}


def get_asset(db: Session, number: str) -> Asset:
    a = db.scalar(select(Asset).where(Asset.number == number.upper()))
    if not a:
        raise HTTPException(404, "Asset not found")
    return a


@router.get("/asset-categories")
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": c.id, "name": c.name} for c in db.scalars(select(AssetCategory).order_by(AssetCategory.sort_order, AssetCategory.name))]


@router.post("/asset-categories", status_code=201)
def add_category(body: dict, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    name = str(body.get("name", "")).strip()
    if not 2 <= len(name) <= 60:
        raise HTTPException(422, "Name must be 2 to 60 characters")
    if db.scalar(select(AssetCategory).where(func.lower(AssetCategory.name) == name.lower())):
        raise HTTPException(409, "Category already exists")
    c = AssetCategory(name=name, sort_order=(db.scalar(select(func.max(AssetCategory.sort_order))) or 0) + 1)
    db.add(c)
    db.flush()
    log_activity(db, admin, "created", "asset_category", c.id, {"name": name})
    db.commit()
    return {"id": c.id, "name": c.name}


@router.get("/assets")
def list_assets(q: str | None = Query(None, max_length=100), category_id: uuid.UUID | None = None, status: str | None = None, owner: str | None = None,
                warranty_filter: str | None = Query(None, alias="warranty"), sort: str = "name", order: str = "asc", page: int = Query(1, ge=1),
                page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if sort not in SORTS:
        raise HTTPException(422, f"Unknown sort field. Use one of: {', '.join(SORTS)}")
    conds = []
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Asset.number.ilike(like), Asset.name.ilike(like), Asset.manufacturer.ilike(like), Asset.model.ilike(like), Asset.serial_number.ilike(like), Asset.location.ilike(like)))
    if category_id:
        conds.append(Asset.category_id == category_id)
    if status:
        conds.append(Asset.status.in_(status.split(",")))
    if owner == "me":
        conds.append(Asset.owner_id == user.id)
    elif owner == "shared":
        conds.append(Asset.owner_id.is_(None))
    elif owner:
        try:
            conds.append(Asset.owner_id == uuid.UUID(owner))
        except ValueError:
            raise HTTPException(422, "Invalid owner")
    today = date.today()
    if warranty_filter == "expired":
        conds.append(Asset.warranty_expires < today)
    elif warranty_filter == "expiring":
        conds += [Asset.warranty_expires >= today, Asset.warranty_expires <= today + timedelta(days=60)]
    elif warranty_filter == "active":
        conds.append(Asset.warranty_expires >= today)
    elif warranty_filter:
        raise HTTPException(422, "Unknown warranty filter")
    col = SORTS[sort]
    total = db.scalar(select(func.count()).select_from(Asset).where(*conds)) or 0
    rows = db.scalars(select(Asset).where(*conds).order_by((col.asc() if order == "asc" else col.desc()).nulls_last(), Asset.number)
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [out(a) for a in rows], "total": total}


def _check(db: Session, category_id, owner_id) -> None:
    if category_id and not db.get(AssetCategory, category_id):
        raise HTTPException(422, "Category does not exist")
    _user(db, owner_id)


@router.post("/assets", status_code=201)
def create(body: AssetIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _check(db, body.category_id, body.owner_id)
    a = Asset(number=next_number(db, "AST"), created_by_id=user.id, **body.model_dump())
    db.add(a)
    db.flush()
    log_activity(db, user, "created", "asset", a.id, {"number": a.number, "name": a.name})
    db.commit()
    db.refresh(a)
    return out(a)


@router.get("/assets/{number}")
def detail(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    a = get_asset(db, number)
    incidents = db.scalars(select(Incident).where(Incident.asset_id == a.id).order_by(Incident.created_at.desc()).limit(50)).unique().all()
    schedules = db.scalars(select(MaintenanceSchedule).where(MaintenanceSchedule.asset_id == a.id).order_by(MaintenanceSchedule.next_due)).unique().all()
    records = db.scalars(select(MaintenanceRecord).where(MaintenanceRecord.asset_id == a.id).order_by(MaintenanceRecord.completed_at.desc()).limit(25)).unique().all()
    sched_names = {s.id: s for s in db.scalars(select(MaintenanceSchedule).where(MaintenanceSchedule.id.in_([r.schedule_id for r in records]))).unique()} if records else {}
    return {**out(a),
            "incidents": [{"number": i.number, "short_description": i.short_description, "state": i.state, "priority": i.priority, "created_at": i.created_at} for i in incidents],
            "schedules": [{"number": s.number, "name": s.name, "frequency": s.frequency, "interval": s.interval, "next_due": s.next_due, "is_active": s.is_active} for s in schedules],
            "records": [{"id": r.id, "schedule_number": sched_names[r.schedule_id].number if r.schedule_id in sched_names else None, "schedule_name": sched_names[r.schedule_id].name if r.schedule_id in sched_names else None,
                         "outcome": r.outcome, "completed_at": r.completed_at, "completed_by": _brief(r.completed_by), "notes": r.notes} for r in records]}


@router.patch("/assets/{number}")
def update(number: str, body: AssetPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_asset(db, number)
    ch = body.model_dump(exclude_unset=True)
    if ch.get("name", "x") is None:
        raise HTTPException(422, "name cannot be empty")
    for k in ("condition", "status"):
        if k in ch and ch[k] is None:
            raise HTTPException(422, f"{k} cannot be empty")
    for k in ("manufacturer", "model", "serial_number", "location", "notes"):
        if k in ch and ch[k] is None:
            ch[k] = ""
    _check(db, ch.get("category_id"), ch.get("owner_id"))
    pd, we = ch.get("purchase_date", a.purchase_date), ch.get("warranty_expires", a.warranty_expires)
    if pd and we and we < pd:
        raise HTTPException(422, "Warranty cannot expire before the purchase date")
    old_cat, old_owner = (a.category.name if a.category else None), (a.owner.full_name if a.owner else None)
    diff = {}
    for k, v in ch.items():
        cur = getattr(a, k)
        if cur == v:
            continue
        if k not in ("category_id", "owner_id", "notes"):
            diff[k] = {"from": str(cur) if cur is not None else None, "to": str(v) if v is not None else None}
        elif k == "notes":
            diff["notes"] = {"from": "(edited)", "to": "(edited)"}
        setattr(a, k, v)
    db.flush()
    db.refresh(a)
    if (a.category.name if a.category else None) != old_cat:
        diff["category"] = {"from": old_cat, "to": a.category.name if a.category else None}
    if (a.owner.full_name if a.owner else None) != old_owner:
        diff["owner"] = {"from": old_owner, "to": a.owner.full_name if a.owner else None}
    if diff:
        log_activity(db, user, "updated", "asset", a.id, diff)
    db.commit()
    db.refresh(a)
    return out(a)


@router.get("/assets/{number}/activity")
def timeline(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return activity_for(db, "asset", get_asset(db, number).id)


@router.get("/assets/{number}/attachments")
def attachments(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    a = get_asset(db, number)
    rows = db.scalars(select(Attachment).where(Attachment.record_type == "asset", Attachment.record_id == str(a.id)).order_by(Attachment.created_at)).all()
    return [{"id": r.id, "name": r.original_name, "size": r.size, "mime": r.mime, "created_at": r.created_at} for r in rows]


@router.post("/assets/{number}/attachments", status_code=201)
async def upload(number: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_asset(db, number)
    att = await save_upload(db, user, "asset", a.id, file)
    db.commit()
    return {"id": att.id, "name": att.original_name, "size": att.size, "mime": att.mime, "created_at": att.created_at}
