from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import User, utcnow
from app.models_incidents import Incident, PriorityMatrix
from app.services.audit import log_activity

STATES = ["new", "in_progress", "on_hold", "resolved", "closed", "cancelled"]
OPEN_STATES = {"new", "in_progress", "on_hold"}
TRANSITIONS = {
    "new": {"in_progress", "on_hold", "resolved", "cancelled"},
    "in_progress": {"on_hold", "resolved", "cancelled"},
    "on_hold": {"in_progress", "resolved", "cancelled"},
    "resolved": {"closed", "in_progress"},  # in_progress from resolved is a reopen
    "closed": set(),
    "cancelled": set(),
}
RESOLUTION_CODES = ["fixed", "workaround", "no_fault_found", "cannot_reproduce", "duplicate", "external_provider"]
DEFAULT_MATRIX = {(1, 1): 1, (1, 2): 2, (1, 3): 3, (2, 1): 2, (2, 2): 3, (2, 3): 4, (3, 1): 3, (3, 2): 4, (3, 3): 4}
DEFAULT_CATEGORIES = {
    "Internet & Network": ["Wi-Fi", "Router / Modem", "ISP outage"],
    "Appliance": ["Kitchen", "Laundry", "Heating & Cooling"],
    "Plumbing & Water": ["Leak", "Drain", "Water supply"],
    "Electrical": ["Power outage", "Lighting", "Wiring"],
    "Vehicle": ["Breakdown", "Servicing", "Registration & insurance"],
    "Home Maintenance": ["Structure", "Garden", "Pests"],
    "Technology": ["Computer", "Phone", "Software"],
    "Other": [],
}


class IllegalTransition(ValueError):
    pass


def priority_for(db: Session, impact: int, urgency: int) -> int:
    row = db.get(PriorityMatrix, (impact, urgency))
    return row.priority if row else DEFAULT_MATRIX.get((impact, urgency), 3)


def transition(db: Session, user: User, inc: Incident, to: str, resolution_code: str | None = None,
               resolution_notes: str | None = None, hold_reason: str | None = None) -> None:
    if to not in TRANSITIONS.get(inc.state, set()):
        raise IllegalTransition(f"Cannot move an incident from {inc.state} to {to}")
    if to == "resolved":
        if resolution_code not in RESOLUTION_CODES or not (resolution_notes or "").strip():
            raise ValueError("Resolving requires a valid resolution code and resolution notes")
    if to == "on_hold" and not (hold_reason or "").strip():
        raise ValueError("Putting an incident on hold requires a reason")
    old, now = inc.state, utcnow()
    details: dict = {"state": {"from": old, "to": to}}
    action = {"resolved": "resolved", "closed": "closed", "cancelled": "cancelled"}.get(to, "state_changed")
    if old == "resolved" and to == "in_progress":
        action, inc.resolved_at = "reopened", None
    if to == "resolved":
        inc.resolution_code, inc.resolution_notes, inc.resolved_at = resolution_code, resolution_notes.strip(), now
        details.update(resolution_code=resolution_code)
    if to == "closed":
        inc.closed_at = now
    if to == "on_hold":
        inc.hold_reason = hold_reason.strip()
        details.update(hold_reason=inc.hold_reason)
    elif old == "on_hold":
        inc.hold_reason = None
    inc.state = to
    log_activity(db, user, action, "incident", inc.id, details)
