import os
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.models_incidents import Attachment, Incident, IncidentCategory, IncidentComment, PriorityMatrix
from app.schemas import (BulkIn, CategoryNode, CommentIn, IncidentCreateIn, IncidentOut, IncidentPage,
                         IncidentUpdateIn, MatrixCell, TransitionIn, UserBrief)
from app.services import incidents as svc
from app.services.attachments import save_upload
from app.services.audit import activity_for, log_activity, next_number

router = APIRouter(tags=["incidents"])


def _brief(u: User | None):
    return UserBrief(id=u.id, full_name=u.full_name, avatar_url=u.avatar_url) if u else None


def _out(i: Incident) -> IncidentOut:
    cat = lambda c: {"id": c.id, "name": c.name} if c else None  # noqa: E731
    return IncidentOut(
        id=i.id, number=i.number, short_description=i.short_description, description=i.description,
        category=cat(i.category), subcategory=cat(i.subcategory), impact=i.impact, urgency=i.urgency,
        priority=i.priority, state=i.state, assigned_to=_brief(i.assigned_to), reported_by=_brief(i.reported_by),
        location=i.location, asset_id=i.asset_id, asset={"id": i.asset.id, "number": i.asset.number, "name": i.asset.name} if i.asset else None, due_date=i.due_date, hold_reason=i.hold_reason,
        resolution_code=i.resolution_code, resolution_notes=i.resolution_notes, created_at=i.created_at,
        updated_at=i.updated_at, resolved_at=i.resolved_at, closed_at=i.closed_at)


def _get(db: Session, number: str) -> Incident:
    inc = db.scalar(select(Incident).where(Incident.number == number.upper()))
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


def _user(db: Session, uid: uuid.UUID | None) -> User | None:
    if uid is None:
        return None
    u = db.get(User, uid)
    if not u or not u.is_active:
        raise HTTPException(422, "Selected user does not exist or is inactive")
    return u


def _check_categories(db: Session, cat_id, sub_id) -> None:
    cat = db.get(IncidentCategory, cat_id) if cat_id else None
    if cat_id and (not cat or cat.parent_id is not None):
        raise HTTPException(422, "Invalid category")
    if sub_id:
        sub = db.get(IncidentCategory, sub_id)
        if not sub or sub.parent_id is None or sub.parent_id != cat_id:
            raise HTTPException(422, "Subcategory does not belong to the selected category")


def _asset(db: Session, asset_id):
    from app.models_assets import Asset
    a = db.get(Asset, asset_id) if asset_id else None
    if asset_id and not a:
        raise HTTPException(422, "Selected asset does not exist")
    return a


def _wrap(fn, *a, **k):
    try:
        return fn(*a, **k)
    except svc.IllegalTransition as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


# ---- reference data --------------------------------------------------------
@router.get("/incident-categories", response_model=list[CategoryNode])
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.scalars(select(IncidentCategory).order_by(IncidentCategory.sort_order, IncidentCategory.name)).all()
    return [CategoryNode(id=c.id, name=c.name, children=[{"id": s.id, "name": s.name} for s in rows if s.parent_id == c.id])
            for c in rows if c.parent_id is None]


@router.get("/incident-meta")
def meta(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return {"states": svc.STATES, "transitions": {k: sorted(v) for k, v in svc.TRANSITIONS.items()},
            "resolution_codes": svc.RESOLUTION_CODES,
            "priority_matrix": [MatrixCell(impact=m.impact, urgency=m.urgency, priority=m.priority)
                                for m in db.scalars(select(PriorityMatrix).order_by(PriorityMatrix.impact, PriorityMatrix.urgency))]}


@router.put("/admin/priority-matrix", response_model=list[MatrixCell])
def set_matrix(cells: list[MatrixCell], db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if {(c.impact, c.urgency) for c in cells} != {(i, u) for i in (1, 2, 3) for u in (1, 2, 3)} or len(cells) != 9:
        raise HTTPException(422, "Provide exactly one priority for each of the 9 impact/urgency combinations")
    old = {(m.impact, m.urgency): m for m in db.scalars(select(PriorityMatrix))}
    changes = {}
    for c in cells:
        m = old.get((c.impact, c.urgency))
        if m is None:
            db.add(PriorityMatrix(**c.model_dump()))
        elif m.priority != c.priority:
            changes[f"impact{c.impact}_urgency{c.urgency}"] = {"from": m.priority, "to": c.priority}
            m.priority = c.priority
    log_activity(db, admin, "priority_matrix_updated", "settings", "priority_matrix", changes)
    db.commit()
    return cells


# ---- list / create ---------------------------------------------------------
SORTS = {"number": Incident.number, "priority": Incident.priority, "state": Incident.state, "updated_at": Incident.updated_at,
         "created_at": Incident.created_at, "due_date": Incident.due_date, "short_description": Incident.short_description}


@router.get("/incidents", response_model=IncidentPage)
def list_incidents(state: str | None = None, priority: int | None = Query(None, ge=1, le=4), category_id: uuid.UUID | None = None,
                   assigned_to: str | None = None, q: str | None = Query(None, max_length=100), overdue: bool = False,
                   sort: str = "updated_at", order: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                   db: Session = Depends(get_db), user: User = Depends(current_user)):
    if sort not in SORTS:
        raise HTTPException(422, f"Unknown sort field. Use one of: {', '.join(SORTS)}")
    conds = []
    if state:
        wanted = svc.OPEN_STATES if state == "open" else {s for s in state.split(",") if s in svc.STATES}
        conds.append(Incident.state.in_(wanted))
    if priority:
        conds.append(Incident.priority == priority)
    if category_id:
        conds.append(Incident.category_id == category_id)
    if assigned_to == "me":
        conds.append(Incident.assigned_to_id == user.id)
    elif assigned_to == "unassigned":
        conds.append(Incident.assigned_to_id.is_(None))
    elif assigned_to:
        try:
            conds.append(Incident.assigned_to_id == uuid.UUID(assigned_to))
        except ValueError:
            raise HTTPException(422, "Invalid assigned_to")
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Incident.number.ilike(like), Incident.short_description.ilike(like), Incident.description.ilike(like)))
    if overdue:
        from app.models import utcnow
        conds.append(Incident.due_date < utcnow())
        conds.append(Incident.state.in_(svc.OPEN_STATES))
    col = SORTS[sort]
    total = db.scalar(select(func.count()).select_from(Incident).where(*conds)) or 0
    rows = db.scalars(select(Incident).where(*conds).order_by(col.asc() if order == "asc" else col.desc(), Incident.number.desc())
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return IncidentPage(items=[_out(r) for r in rows], total=total)


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def create_incident(body: IncidentCreateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _check_categories(db, body.category_id, body.subcategory_id)
    _user(db, body.assigned_to_id)
    asset = _asset(db, body.asset_id)
    reporter = _user(db, body.reported_by_id) or user
    inc = Incident(number=next_number(db, "INC"), created_by_id=user.id, reported_by_id=reporter.id,
                   priority=svc.priority_for(db, body.impact, body.urgency),
                   **body.model_dump(exclude={"reported_by_id"}))
    db.add(inc)
    db.flush()
    log_activity(db, user, "created", "incident", inc.id, {"number": inc.number, "priority": inc.priority})
    if inc.assigned_to_id:
        log_activity(db, user, "assigned", "incident", inc.id, {"assigned_to": {"from": None, "to": inc.assigned_to.full_name if inc.assigned_to else None}})
    if asset:
        log_activity(db, user, "incident_linked", "asset", asset.id, {"incident": inc.number})
    db.commit()
    db.refresh(inc)
    return _out(inc)


# ---- detail / update -------------------------------------------------------
@router.get("/incidents/{number}", response_model=IncidentOut)
def get_incident(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return _out(_get(db, number))


@router.patch("/incidents/{number}", response_model=IncidentOut)
def update_incident(number: str, body: IncidentUpdateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    inc = _get(db, number)
    if inc.state in ("closed", "cancelled"):
        raise HTTPException(409, f"A {inc.state} incident cannot be edited")
    ch = body.model_dump(exclude_unset=True)
    for k in ("short_description", "impact", "urgency"):
        if k in ch and ch[k] is None:
            raise HTTPException(422, f"{k} cannot be empty")
    cat = ch.get("category_id", inc.category_id)
    sub = ch.get("subcategory_id", inc.subcategory_id)
    if "category_id" in ch and "subcategory_id" not in ch and sub:
        sub = None
        ch["subcategory_id"] = None  # category changed: drop the stale subcategory
    _check_categories(db, cat, sub)
    if "assigned_to_id" in ch:
        _user(db, ch["assigned_to_id"])
    if "asset_id" in ch:
        _asset(db, ch["asset_id"])
    old_asset = inc.asset.number if inc.asset else None
    if "reported_by_id" in ch and ch["reported_by_id"] is None:
        raise HTTPException(422, "reported_by cannot be empty")
    if "reported_by_id" in ch:
        _user(db, ch["reported_by_id"])

    old_assignee = inc.assigned_to.full_name if inc.assigned_to else None
    old_cat, old_sub = (inc.category.name if inc.category else None), (inc.subcategory.name if inc.subcategory else None)
    diff, assign_change = {}, None
    for k, v in ch.items():
        cur = getattr(inc, k)
        if cur == v:
            continue
        if k not in ("assigned_to_id", "category_id", "subcategory_id", "reported_by_id", "asset_id"):
            diff[k] = {"from": cur.isoformat() if hasattr(cur, "isoformat") else cur, "to": v.isoformat() if hasattr(v, "isoformat") else v}
        setattr(inc, k, v)
    old_pri = inc.priority
    inc.priority = svc.priority_for(db, inc.impact, inc.urgency)
    if inc.priority != old_pri:
        diff["priority"] = {"from": old_pri, "to": inc.priority}
    db.flush()
    db.refresh(inc)
    new_asset = inc.asset.number if inc.asset else None
    if new_asset != old_asset:
        diff["asset"] = {"from": old_asset, "to": new_asset}
        if inc.asset:
            log_activity(db, user, "incident_linked", "asset", inc.asset.id, {"incident": inc.number})
    new_cat, new_sub = (inc.category.name if inc.category else None), (inc.subcategory.name if inc.subcategory else None)
    if (new_cat, new_sub) != (old_cat, old_sub):
        diff["category"] = {"from": " / ".join(x for x in (old_cat, old_sub) if x) or None,
                            "to": " / ".join(x for x in (new_cat, new_sub) if x) or None}
    if diff:
        log_activity(db, user, "updated", "incident", inc.id, diff)
    new_assignee = inc.assigned_to.full_name if inc.assigned_to else None
    if new_assignee != old_assignee:
        log_activity(db, user, "assigned" if new_assignee else "unassigned", "incident", inc.id, {"assigned_to": {"from": old_assignee, "to": new_assignee}})
    db.commit()
    db.refresh(inc)
    return _out(inc)


@router.post("/incidents/{number}/transition", response_model=IncidentOut)
def transition(number: str, body: TransitionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    inc = _get(db, number)
    _wrap(svc.transition, db, user, inc, body.to, body.resolution_code, body.resolution_notes, body.hold_reason)
    db.commit()
    db.refresh(inc)
    return _out(inc)


@router.post("/incidents/bulk")
def bulk(body: BulkIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.action == "transition" and body.to not in ("in_progress", "closed", "cancelled"):
        raise HTTPException(422, "Bulk state changes support in_progress, closed and cancelled only")
    target = _user(db, body.assigned_to_id) if body.action == "assign" else None
    done, failed = [], []
    for n in dict.fromkeys(body.numbers):
        inc = db.scalar(select(Incident).where(Incident.number == n.upper()))
        if not inc:
            failed.append({"number": n, "error": "Not found"})
            continue
        try:
            if body.action == "assign":
                if inc.state in ("closed", "cancelled"):
                    raise ValueError(f"A {inc.state} incident cannot be reassigned")
                old = inc.assigned_to.full_name if inc.assigned_to else None
                inc.assigned_to_id = target.id if target else None
                log_activity(db, user, "assigned" if target else "unassigned", "incident", inc.id,
                             {"assigned_to": {"from": old, "to": target.full_name if target else None}})
            else:
                svc.transition(db, user, inc, body.to)
            db.flush()
            done.append(n)
        except ValueError as e:
            failed.append({"number": n, "error": str(e)})
    db.commit()
    return {"updated": done, "failed": failed}


# ---- comments, timeline, attachments ---------------------------------------
@router.post("/incidents/{number}/comments", status_code=201)
def add_comment(number: str, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    inc = _get(db, number)
    c = IncidentComment(incident_id=inc.id, author_id=user.id, kind=body.kind, body=body.body.strip())
    db.add(c)
    db.flush()
    log_activity(db, user, "commented" if body.kind == "comment" else "work_note", "incident", inc.id, {"comment_id": str(c.id)})
    inc.updated_at = c.created_at
    db.commit()
    return {"id": c.id}


@router.get("/incidents/{number}/activity")
def timeline(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    inc = _get(db, number)
    bodies = {str(c.id): c for c in db.scalars(select(IncidentComment).where(IncidentComment.incident_id == inc.id))}
    out = []
    for a in activity_for(db, "incident", inc.id):
        c = bodies.get(a["details"].get("comment_id", ""))
        out.append({**a, "comment": {"kind": c.kind, "body": c.body} if c else None})
    return out


@router.get("/incidents/{number}/attachments")
def list_attachments(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    inc = _get(db, number)
    rows = db.scalars(select(Attachment).where(Attachment.record_type == "incident", Attachment.record_id == str(inc.id)).order_by(Attachment.created_at)).all()
    return [{"id": a.id, "name": a.original_name, "size": a.size, "mime": a.mime, "created_at": a.created_at} for a in rows]


@router.post("/incidents/{number}/attachments", status_code=201)
async def upload(number: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    inc = _get(db, number)
    att = await save_upload(db, user, "incident", inc.id, file)
    db.commit()
    return {"id": att.id, "name": att.original_name, "size": att.size, "mime": att.mime, "created_at": att.created_at}


@router.get("/attachments/{attachment_id}")
def download(attachment_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    a = db.get(Attachment, attachment_id)
    path = os.path.join(get_settings().upload_dir, a.stored_name) if a else ""
    if not a or not os.path.isfile(path):
        raise HTTPException(404, "Attachment not found")
    return FileResponse(path, media_type=a.mime, filename=a.original_name, content_disposition_type="attachment",
                        headers={"X-Content-Type-Options": "nosniff"})
