import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user
from app.models import ActivityLog, User
from app.models_catalog import CatalogItem
from app.models_incidents import Incident
from app.models_requests import Approval, RecordComment, Request, RequestedItem, ServiceTask
from app.models_tasks import Task
from app.routers.incidents import _brief, _out as incident_out, _user
from app.routers.tasks import _decorate as task_cards
from app.schemas_catalog import (CommentIn, ConfirmIn, DecisionIn, RequestIn, RitmPatchIn, SCPatchIn, SCTransitionIn)
from app.services import requests as svc
from app.services.audit import log_activity

router = APIRouter(tags=["requests"])


def _wrap(fn, *a):
    try:
        return fn(*a)
    except svc.Conflict as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        arg = e.args[0] if e.args else str(e)
        raise HTTPException(422, arg if isinstance(arg, (dict, list)) else str(e))


def _is_admin(u: User) -> bool:
    return u.role.name == "admin"


def _get_req(db: Session, number: str) -> Request:
    r = db.scalar(select(Request).where(Request.number == number.upper()))
    if not r:
        raise HTTPException(404, "Request not found")
    return r


def _get_ritm(db: Session, number: str) -> RequestedItem:
    r = db.scalar(select(RequestedItem).where(RequestedItem.number == number.upper()))
    if not r:
        raise HTTPException(404, "Requested item not found")
    return r


def _get_sctask(db: Session, number: str) -> ServiceTask:
    t = db.scalar(select(ServiceTask).where(ServiceTask.number == number.upper()))
    if not t:
        raise HTTPException(404, "Service task not found")
    return t


def _sct(t: ServiceTask) -> dict:
    return {"id": t.id, "number": t.number, "title": t.title, "description": t.description, "state": t.state, "assigned_to": _brief(t.assigned_to),
            "due_date": t.due_date, "completed_at": t.completed_at}


def _form(r: RequestedItem) -> list[dict]:
    return [{"label": l["label"], "value": r.form_data.get(l["key"])} for l in (r.form_labels or []) if l["key"] in (r.form_data or {})]


def _ritm(r: RequestedItem) -> dict:
    return {"id": r.id, "number": r.number, "item_id": r.item_id, "item_name": r.item_name, "state": r.state, "form": _form(r), "assigned_to": _brief(r.assigned_to),
            "due_date": r.due_date, "completed_at": r.completed_at, "sequential": r.sequential, "tasks": [_sct(t) for t in r.tasks],
            "approvals": [{"id": a.id, "state": a.state, "approver": _brief(a.approver), "comment": a.comment, "decided_at": a.decided_at} for a in r.approvals]}


def _req(r: Request, full: bool = False) -> dict:
    d = {"id": r.id, "number": r.number, "state": r.state, "short_description": r.short_description, "requester": _brief(r.requester),
         "created_at": r.created_at, "updated_at": r.updated_at, "closed_at": r.closed_at,
         "ritms": [{"number": x.number, "item_name": x.item_name, "state": x.state} for x in r.ritms]}
    if full:
        d["justification"] = r.justification
        d["ritms"] = [_ritm(x) for x in r.ritms]
    return d


@router.get("/requests")
def list_requests(scope: str = "mine", state: str | None = None, q: str | None = Query(None, max_length=100), page: int = Query(1, ge=1),
                  page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user)):
    conds = []
    if scope == "mine":
        conds.append(Request.requester_id == user.id)
    elif scope == "active":
        conds.append(Request.state.in_(["awaiting_approval", "in_progress"]))
    elif scope != "all":
        raise HTTPException(422, "Unknown scope")
    if state:
        conds.append(Request.state.in_([s for s in state.split(",")]))
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(Request.number.ilike(like), Request.short_description.ilike(like)))
    total = db.scalar(select(func.count()).select_from(Request).where(*conds)) or 0
    rows = db.scalars(select(Request).where(*conds).order_by(Request.created_at.desc(), Request.number.desc()).limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [_req(r) for r in rows], "total": total}


@router.post("/requests", status_code=201)
def submit(body: RequestIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    entries, errors = [], {}
    for n, e in enumerate(body.items):
        item = db.get(CatalogItem, e.item_id)
        if not item or not item.is_active:
            raise HTTPException(422, "One of the selected services is not available")
        try:
            entries.append((item, svc.validate_form(item.fields, e.form_data)))
        except ValueError as ex:
            errors = ex.args[0]["form_errors"]
            raise HTTPException(422, {"form_errors": errors, "item_index": n})
    req = svc.submit_request(db, user, entries, body.justification)
    db.commit()
    db.refresh(req)
    return _req(req, full=True)


@router.get("/requests/{number}")
def get_request(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return _req(_get_req(db, number), full=True)


@router.post("/requests/{number}/cancel")
def cancel(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    req = _get_req(db, number)
    if req.requester_id != user.id and not _is_admin(user):
        raise HTTPException(403, "Only the requester or an administrator can cancel a request")
    _wrap(svc.cancel_request, db, user, req)
    db.commit()
    db.refresh(req)
    return _req(req, full=True)


@router.get("/requests/{number}/activity")
def request_activity(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    req = _get_req(db, number)
    ids = {str(req.id): ("request", req.number)}
    for r in req.ritms:
        ids[str(r.id)] = ("ritm", r.number)
        for t in r.tasks:
            ids[str(t.id)] = ("sctask", t.number)
    rows = db.execute(select(ActivityLog, User.full_name).outerjoin(User, User.id == ActivityLog.user_id)
                      .where(ActivityLog.record_id.in_(list(ids)), ActivityLog.record_type.in_(["request", "ritm", "sctask"]))
                      .order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())).all()
    bodies = {str(c.id): c.body for c in db.scalars(select(RecordComment).where(RecordComment.record_id.in_(list(ids))))}
    return [{"id": str(a.id), "action": a.action, "user_name": name, "details": a.details or {}, "created_at": a.created_at,
             "record_type": ids[a.record_id][0], "record_number": ids[a.record_id][1],
             "comment": {"kind": "comment", "body": bodies[a.details["comment_id"]]} if a.details.get("comment_id") in bodies else None}
            for a, name in rows if a.record_id in ids and a.record_type == ids[a.record_id][0]]


@router.post("/records/{rtype}/{number}/comments", status_code=201)
def comment(rtype: str, number: str, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rec = {"request": _get_req, "ritm": _get_ritm, "sctask": _get_sctask}.get(rtype)
    if not rec:
        raise HTTPException(404, "Unknown record type")
    obj = rec(db, number)
    c = RecordComment(record_type=rtype, record_id=str(obj.id), author_id=user.id, body=body.body.strip())
    db.add(c)
    db.flush()
    log_activity(db, user, "commented", rtype, obj.id, {"comment_id": str(c.id)})
    db.commit()
    return {"id": c.id}


# ---- requested items -------------------------------------------------------
@router.get("/ritms/{number}")
def get_ritm(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    r = _get_ritm(db, number)
    return {**_ritm(r), "request_number": r.request.number}


@router.patch("/ritms/{number}")
def patch_ritm(number: str, body: RitmPatchIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = _get_ritm(db, number)
    if r.state in svc.RITM_TERMINAL:
        raise HTTPException(409, f"A {r.state} item cannot be changed")
    ch = body.model_dump(exclude_unset=True)
    if "assigned_to_id" in ch:
        _user(db, ch["assigned_to_id"])
        old = r.assigned_to.full_name if r.assigned_to else None
        r.assigned_to_id = ch["assigned_to_id"]
        db.flush()
        db.refresh(r)
        log_activity(db, user, "assigned" if r.assigned_to else "unassigned", "ritm", r.id, {"assigned_to": {"from": old, "to": r.assigned_to.full_name if r.assigned_to else None}})
    db.commit()
    return _ritm(r)


@router.post("/ritms/{number}/fulfill")
def fulfill(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = _get_ritm(db, number)
    _wrap(svc.fulfill, db, user, r)
    db.commit()
    return _ritm(r)


@router.post("/ritms/{number}/confirm")
def confirm(number: str, body: ConfirmIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = _get_ritm(db, number)
    if r.request.requester_id != user.id and not _is_admin(user):
        raise HTTPException(403, "Only the requester or an administrator can confirm completion")
    _wrap(svc.confirm, db, user, r, body.accepted, body.comment)
    db.commit()
    return _ritm(r)


# ---- service tasks ---------------------------------------------------------
def _sct_row(t: ServiceTask, ritm_number: str, item_name: str, req_number: str) -> dict:
    return {**_sct(t), "ritm_number": ritm_number, "item_name": item_name, "request_number": req_number}


@router.get("/sctasks")
def list_sctasks(scope: str = "mine", page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user)):
    conds = []
    if scope == "mine":
        conds += [ServiceTask.assigned_to_id == user.id, ServiceTask.state.in_(["open", "in_progress"])]
    elif scope == "open":
        conds.append(ServiceTask.state.in_(["open", "in_progress"]))
    elif scope != "all":
        raise HTTPException(422, "Unknown scope")
    base = select(ServiceTask, RequestedItem.number, RequestedItem.item_name, Request.number).join(RequestedItem, RequestedItem.id == ServiceTask.ritm_id).join(Request, Request.id == RequestedItem.request_id).where(*conds)
    total = db.scalar(select(func.count()).select_from(ServiceTask).where(*conds)) or 0
    rows = db.execute(base.order_by(ServiceTask.due_date.asc().nulls_last(), ServiceTask.number.desc()).limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [_sct_row(t, rn, name, qn) for t, rn, name, qn in rows], "total": total}


@router.get("/sctasks/{number}")
def get_sctask(number: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    t = _get_sctask(db, number)
    r = db.get(RequestedItem, t.ritm_id)
    return _sct_row(t, r.number, r.item_name, r.request.number)


@router.post("/sctasks/{number}/transition")
def sc_transition(number: str, body: SCTransitionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get_sctask(db, number)
    _wrap(svc.sctask_transition, db, user, t, body.to)
    db.commit()
    db.refresh(t)
    r = db.get(RequestedItem, t.ritm_id)
    return {"task": _sct(t), "ritm_state": r.state, "request_state": r.request.state}


@router.patch("/sctasks/{number}")
def sc_patch(number: str, body: SCPatchIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = _get_sctask(db, number)
    if t.state in svc.SCTASK_TERMINAL:
        raise HTTPException(409, f"A {t.state} task cannot be changed")
    ch = body.model_dump(exclude_unset=True)
    if "assigned_to_id" in ch:
        _user(db, ch["assigned_to_id"])
        old = t.assigned_to.full_name if t.assigned_to else None
        t.assigned_to_id = ch["assigned_to_id"]
        db.flush()
        db.refresh(t)
        log_activity(db, user, "assigned" if t.assigned_to else "unassigned", "sctask", t.id, {"assigned_to": {"from": old, "to": t.assigned_to.full_name if t.assigned_to else None}})
    if "due_date" in ch:
        old_due, t.due_date = t.due_date, ch["due_date"]
        log_activity(db, user, "updated", "sctask", t.id, {"due_date": {"from": old_due.isoformat() if old_due else None, "to": t.due_date.isoformat() if t.due_date else None}})
    db.commit()
    return _sct(t)


# ---- approvals -------------------------------------------------------------
def _approval_row(db: Session, a: Approval) -> dict:
    r = db.get(RequestedItem, a.ritm_id)
    return {"id": a.id, "state": a.state, "comment": a.comment, "created_at": a.created_at, "decided_at": a.decided_at, "approver": _brief(a.approver),
            "ritm_number": r.number, "item_name": r.item_name, "request_number": r.request.number, "requester": _brief(r.request.requester),
            "justification": r.request.justification, "form": _form(r)}


@router.get("/approvals")
def list_approvals(scope: str = "mine", state: str = "requested", db: Session = Depends(get_db), user: User = Depends(current_user)):
    conds = []
    if scope == "mine":
        conds.append(Approval.approver_id == user.id)
    elif scope != "all":
        raise HTTPException(422, "Unknown scope")
    if state != "all":
        conds.append(Approval.state == state)
    rows = db.scalars(select(Approval).where(*conds).order_by(Approval.created_at.desc()).limit(100)).unique().all()
    return [_approval_row(db, a) for a in rows]


@router.post("/approvals/{aid}/decision")
def decide(aid: uuid.UUID, body: DecisionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = db.get(Approval, aid)
    if not a:
        raise HTTPException(404, "Approval not found")
    if a.approver_id != user.id and not _is_admin(user):
        raise HTTPException(403, "Only the approver or an administrator can decide this")
    _wrap(svc.decide, db, user, a, body.decision == "approve", body.comment)
    db.commit()
    return _approval_row(db, a)


# ---- my work ---------------------------------------------------------------
@router.get("/my-work")
def my_work(db: Session = Depends(get_db), user: User = Depends(current_user)):
    incidents = db.scalars(select(Incident).where(Incident.assigned_to_id == user.id, Incident.state.in_(["new", "in_progress", "on_hold"]))
                           .order_by(Incident.priority, Incident.updated_at.desc()).limit(50)).unique().all()
    tasks = db.scalars(select(Task).where(Task.assigned_to_id == user.id, Task.state.in_(["open", "in_progress", "blocked"]))
                       .order_by(Task.due_date.asc().nulls_last(), Task.priority).limit(50)).unique().all()
    sct = db.execute(select(ServiceTask, RequestedItem.number, RequestedItem.item_name, Request.number)
                     .join(RequestedItem, RequestedItem.id == ServiceTask.ritm_id).join(Request, Request.id == RequestedItem.request_id)
                     .where(ServiceTask.assigned_to_id == user.id, ServiceTask.state.in_(["open", "in_progress"]))
                     .order_by(ServiceTask.due_date.asc().nulls_last()).limit(50)).unique().all()
    approvals = db.scalars(select(Approval).where(Approval.approver_id == user.id, Approval.state == "requested").order_by(Approval.created_at)).unique().all()
    confirms = db.scalars(select(RequestedItem).join(Request, Request.id == RequestedItem.request_id)
                          .where(Request.requester_id == user.id, RequestedItem.state == "awaiting_confirmation")).unique().all()
    mine = db.scalars(select(Request).where(Request.requester_id == user.id, Request.state.in_(["awaiting_approval", "in_progress"])).order_by(Request.created_at.desc()).limit(20)).unique().all()
    return {"incidents": [incident_out(i) for i in incidents], "tasks": task_cards(db, list(tasks)),
            "sctasks": [_sct_row(t, rn, name, qn) for t, rn, name, qn in sct], "approvals": [_approval_row(db, a) for a in approvals],
            "confirmations": [{"ritm_number": r.number, "item_name": r.item_name, "request_number": r.request.number} for r in confirms],
            "requests": [_req(r) for r in mine]}
