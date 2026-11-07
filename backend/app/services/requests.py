"""Request fulfillment workflow: form validation, approvals, SCTASK generation, state roll-up."""
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import User, utcnow
from app.models_catalog import CatalogFormField, CatalogItem
from app.models_requests import Approval, Request, RequestedItem, ServiceTask
from app.services.audit import log_activity, next_number

FIELD_TYPES = ("text", "textarea", "number", "date", "select", "checkbox")
ASSIGNEE_MODES = ("requester", "other_member", "item_default", "user")
RITM_TERMINAL = {"completed", "cancelled", "rejected"}
RITM_FULFILLING = {"open", "in_progress", "awaiting_confirmation"}
SCTASK_TERMINAL = {"completed", "cancelled"}


class Conflict(ValueError):
    pass


def validate_form(fields: list[CatalogFormField], data: dict) -> dict:
    """Server-side validation against the catalog definition. Never trust the client's idea of the form."""
    known = {f.key: f for f in fields}
    errors, clean = {}, {}
    for k in data:
        if k not in known:
            errors[k] = "Unknown field"
    for f in fields:
        v = data.get(f.key)
        if v is None or v == "":
            if f.required:
                errors[f.key] = "This field is required"
            continue
        try:
            if f.field_type in ("text", "textarea"):
                if not isinstance(v, str):
                    raise ValueError("Must be text")
                if len(v) > (5000 if f.field_type == "textarea" else 500):
                    raise ValueError("Too long")
                clean[f.key] = v.strip()
            elif f.field_type == "number":
                if isinstance(v, bool) or not isinstance(v, (int, float, str)):
                    raise ValueError("Must be a number")
                clean[f.key] = float(v) if "." in str(v) else int(v)
            elif f.field_type == "date":
                clean[f.key] = date.fromisoformat(str(v)).isoformat()
            elif f.field_type == "select":
                if v not in (f.options or []):
                    raise ValueError("Choose one of the listed options")
                clean[f.key] = v
            elif f.field_type == "checkbox":
                if not isinstance(v, bool):
                    raise ValueError("Must be true or false")
                if f.required and not v:
                    raise ValueError("This box must be ticked")
                clean[f.key] = v
        except (ValueError, TypeError):
            errors[f.key] = "Enter a valid value" if f.field_type in ("number", "date") else "Invalid value"
    if errors:
        raise ValueError({"form_errors": errors})
    return clean


def active_members(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.is_active).order_by(User.created_at, User.email)))


def resolve_assignee(db: Session, mode: str, assignee_id, item: CatalogItem, requester: User) -> User | None:
    if mode == "requester":
        return requester
    if mode == "other_member":
        return next((m for m in active_members(db) if m.id != requester.id), requester)
    if mode == "item_default":
        return db.get(User, item.default_assignee_id) if item.default_assignee_id else None
    if mode == "user":
        u = db.get(User, assignee_id) if assignee_id else None
        return u if u and u.is_active else None
    return None


def resolve_approver(db: Session, item: CatalogItem, requester: User) -> User:
    if item.approver_id:
        u = db.get(User, item.approver_id)
        if u and u.is_active:
            return u
    others = [m for m in active_members(db) if m.id != requester.id]
    admins = [m for m in others if m.role.name == "admin"]
    return (admins or others or [requester])[0]


def recompute_request(db: Session, user: User | None, req: Request) -> None:
    states = [r.state for r in req.ritms]
    if not states:
        return
    if all(s in RITM_TERMINAL for s in states):
        new = "completed" if "completed" in states else ("rejected" if "rejected" in states else "cancelled")
    elif any(s in RITM_FULFILLING for s in states):
        new = "in_progress"
    else:
        new = "awaiting_approval"
    if new != req.state:
        log_activity(db, user, "state_changed", "request", req.id, {"state": {"from": req.state, "to": new}})
        req.state = new
        req.closed_at = utcnow() if new in ("completed", "rejected", "cancelled") else None


def start_fulfillment(db: Session, user: User, ritm: RequestedItem, item: CatalogItem, requester: User) -> None:
    """Move a RITM into fulfillment and generate its SCTASKs from the catalog template."""
    now = utcnow()
    ritm.state = "open"
    ritm.sequential = item.sequential
    owner = resolve_assignee(db, "item_default", None, item, requester)
    ritm.assigned_to_id = owner.id if owner else None
    if item.estimated_hours:
        ritm.due_date = now + timedelta(hours=item.estimated_hours)
    for n, tpl in enumerate(item.templates):
        who = resolve_assignee(db, tpl.assignee_mode, tpl.assignee_id, item, requester)
        t = ServiceTask(number=next_number(db, "SCTASK"), ritm_id=ritm.id, title=tpl.title, description=tpl.description, sort_order=n,
                        state="open" if (n == 0 or not item.sequential) else "pending", assigned_to_id=who.id if who else None,
                        due_date=now + timedelta(days=tpl.due_offset_days) if tpl.due_offset_days is not None else None)
        db.add(t)
        db.flush()
        ritm.tasks.append(t)
        log_activity(db, user, "created", "sctask", t.id, {"number": t.number, "ritm": ritm.number})
    log_activity(db, user, "fulfillment_started", "ritm", ritm.id, {"tasks": len(item.templates)})


def submit_request(db: Session, user: User, entries: list[tuple[CatalogItem, dict]], justification: str) -> Request:
    summary = ", ".join(i.name for i, _ in entries)
    req = Request(number=next_number(db, "REQ"), requester_id=user.id, short_description=summary[:255], justification=justification.strip())
    db.add(req)
    db.flush()
    log_activity(db, user, "created", "request", req.id, {"number": req.number, "items": [i.name for i, _ in entries]})
    for item, data in entries:
        ritm = RequestedItem(number=next_number(db, "RITM"), request_id=req.id, item_id=item.id, item_name=item.name, form_data=data,
                             form_labels=[{"key": f.key, "label": f.label} for f in item.fields], sequential=item.sequential, state="open")
        db.add(ritm)
        db.flush()
        req.ritms.append(ritm)
        log_activity(db, user, "created", "ritm", ritm.id, {"number": ritm.number, "item": item.name, "request": req.number})
        if item.approval_required:
            approver = resolve_approver(db, item, user)
            ritm.state = "pending_approval"
            ap = Approval(ritm_id=ritm.id, approver_id=approver.id)
            db.add(ap)
            ritm.approvals.append(ap)
            log_activity(db, user, "approval_requested", "ritm", ritm.id, {"approver": approver.full_name})
        else:
            start_fulfillment(db, user, ritm, item, user)
    recompute_request(db, user, req)
    return req


def decide(db: Session, user: User, ap: Approval, approve: bool, comment: str | None) -> None:
    ritm = db.get(RequestedItem, ap.ritm_id)
    if ap.state != "requested" or ritm.state != "pending_approval":
        raise Conflict("This approval has already been decided or is no longer pending")
    if not approve and not (comment or "").strip():
        raise ValueError("Please give a reason for rejecting")
    ap.state, ap.comment, ap.decided_by_id, ap.decided_at = ("approved" if approve else "rejected"), (comment or "").strip() or None, user.id, utcnow()
    log_activity(db, user, "approved" if approve else "rejected", "ritm", ritm.id, {"comment": ap.comment})
    req = ritm.request
    if approve:
        start_fulfillment(db, user, ritm, db.get(CatalogItem, ritm.item_id), req.requester or user)
    else:
        ritm.state = "rejected"
    recompute_request(db, user, req)


def _settle_ritm(db: Session, user: User, ritm: RequestedItem) -> None:
    tasks = ritm.tasks
    if ritm.state in ("open", "in_progress") and tasks and all(t.state in SCTASK_TERMINAL for t in tasks) and any(t.state == "completed" for t in tasks):
        ritm.state = "awaiting_confirmation"
        log_activity(db, user, "awaiting_confirmation", "ritm", ritm.id, {})
    recompute_request(db, user, ritm.request)


def sctask_transition(db: Session, user: User, t: ServiceTask, to: str) -> None:
    allowed = {"pending": {"cancelled"}, "open": {"in_progress", "completed", "cancelled"}, "in_progress": {"open", "completed", "cancelled"}}
    if to not in allowed.get(t.state, set()):
        raise Conflict(f"Cannot move a {t.state} task to {to}" if t.state in allowed else f"A {t.state} task cannot be changed")
    ritm = db.get(RequestedItem, t.ritm_id)
    if ritm.state not in RITM_FULFILLING:
        raise Conflict(f"The requested item is {ritm.state}; its tasks can no longer change")
    old = t.state
    t.state = to
    t.completed_at = utcnow() if to == "completed" else None
    log_activity(db, user, {"completed": "completed", "cancelled": "cancelled"}.get(to, "state_changed"), "sctask", t.id, {"state": {"from": old, "to": to}})
    if to == "in_progress" and ritm.state == "open":
        ritm.state = "in_progress"
        log_activity(db, user, "state_changed", "ritm", ritm.id, {"state": {"from": "open", "to": "in_progress"}})
    if to in SCTASK_TERMINAL and ritm.sequential:
        nxt = next((x for x in ritm.tasks if x.state == "pending"), None)
        if nxt:
            nxt.state = "open"
            log_activity(db, user, "state_changed", "sctask", nxt.id, {"state": {"from": "pending", "to": "open"}})
    _settle_ritm(db, user, ritm)


def fulfill(db: Session, user: User, ritm: RequestedItem) -> None:
    if ritm.state not in ("open", "in_progress"):
        raise Conflict(f"A {ritm.state} item cannot be marked fulfilled")
    if any(t.state not in SCTASK_TERMINAL for t in ritm.tasks):
        raise Conflict("Finish or cancel the open fulfillment tasks first")
    ritm.state = "awaiting_confirmation"
    log_activity(db, user, "awaiting_confirmation", "ritm", ritm.id, {})
    recompute_request(db, user, ritm.request)


def confirm(db: Session, user: User, ritm: RequestedItem, accepted: bool, comment: str | None) -> None:
    if ritm.state != "awaiting_confirmation":
        raise Conflict("This item is not waiting for confirmation")
    if not accepted and not (comment or "").strip():
        raise ValueError("Please say what still needs doing")
    if accepted:
        ritm.state, ritm.completed_at = "completed", utcnow()
        log_activity(db, user, "confirmed", "ritm", ritm.id, {})
    else:
        ritm.state = "in_progress"
        log_activity(db, user, "confirmation_declined", "ritm", ritm.id, {"comment": comment.strip()})
    recompute_request(db, user, ritm.request)


def cancel_request(db: Session, user: User, req: Request) -> None:
    if req.state in ("completed", "rejected", "cancelled"):
        raise Conflict(f"A {req.state} request cannot be cancelled")
    for r in req.ritms:
        if r.state in RITM_TERMINAL:
            continue
        r.state = "cancelled"
        for t in r.tasks:
            if t.state not in SCTASK_TERMINAL:
                t.state = "cancelled"
                log_activity(db, user, "cancelled", "sctask", t.id, {"reason": "request cancelled"})
        for a in r.approvals:
            if a.state == "requested":
                a.state = "cancelled"
        log_activity(db, user, "cancelled", "ritm", r.id, {})
    log_activity(db, user, "cancelled", "request", req.id, {})
    recompute_request(db, user, req)
