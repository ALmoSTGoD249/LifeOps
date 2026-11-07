import io
from datetime import datetime, timedelta, timezone
import pytest
from app.services.recurrence import add_months, advance, next_due_after
from tests.helpers import ensure_partner
from tests.test_incidents import ac, new as new_incident  # noqa: F401  (fixtures/helpers)


@pytest.fixture(autouse=True)
def _partner(client):
    ensure_partner(client)


def mk(ac, **kw):
    r = ac.post("/api/tasks", json={"title": "Call the plumber", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def iso(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def move(ac, n, to, **kw):
    return ac.post(f"/api/tasks/{n}/transition", json={"to": to, **kw})


def test_recurrence_math():
    assert add_months(datetime(2026, 1, 31), 1) == datetime(2026, 2, 28)
    assert advance(datetime(2026, 11, 3), "quarterly") == datetime(2027, 2, 3)
    assert advance(datetime(2026, 2, 28), "yearly") == datetime(2027, 2, 28)
    now = datetime(2026, 11, 3, 12)
    assert next_due_after(datetime(2026, 10, 1), now, "weekly") > now


def test_create_validate_number_checklist(ac):
    assert ac.post("/api/tasks", json={"title": "x"}).status_code == 422
    t = mk(ac, checklist=["Find number", "Book slot", "  "], priority=2)
    assert t["number"].startswith("TASK") and t["state"] == "open" and t["source"] == "manual"
    assert [c["text"] for c in t["checklist"]] == ["Find number", "Book slot"]
    assert t["checklist_total"] == 2 and t["created_by"]["full_name"] == "Admin"


def test_incident_link_and_filter(ac):
    inc = new_incident(ac)
    t = mk(ac, incident_number=inc["number"])
    assert t["source"] == "incident" and t["parent"]["number"] == inc["number"]
    assert mk(ac)["parent"] is None
    assert ac.post("/api/tasks", json={"title": "bad link", "incident_number": "INC999999"}).status_code == 422
    r = ac.get(f"/api/tasks?incident={inc['number']}").json()
    assert r["total"] == 1 and r["items"][0]["number"] == t["number"]
    tl = ac.get(f"/api/incidents/{inc['number']}/activity").json()
    assert any(x["action"] == "task_linked" for x in tl)
    un = ac.patch(f"/api/tasks/{t['number']}", json={"incident_number": None}).json()
    assert un["parent"] is None and un["source"] == "manual"


def test_scopes_and_calendar_range(ac):
    me = ac.get("/api/auth/me").json()["user"]["id"]
    other = next(u["id"] for u in ac.get("/api/users").json() if u["email"] == "p@example.com")
    a = mk(ac, title="Mine overdue task", assigned_to_id=me, due_date=iso(-2))
    b = mk(ac, title="Delegated upcoming", assigned_to_id=other, due_date=iso(3))
    c = mk(ac, title="Nobody owns this")
    nums = lambda q: {x["number"] for x in ac.get(f"/api/tasks?{q}&page_size=200").json()["items"]}  # noqa: E731
    assert a["number"] in nums("scope=mine") and b["number"] not in nums("scope=mine")
    assert b["number"] in nums("scope=by_me") and a["number"] not in nums("scope=by_me")
    assert a["number"] in nums("scope=overdue") and b["number"] not in nums("scope=overdue")
    assert b["number"] in nums("scope=upcoming") and a["number"] not in nums("scope=upcoming")
    assert c["number"] in nums("scope=unassigned")
    start, end = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()
    assert b["number"] in nums(f"due_from={start}&due_to={end}".replace("+", "%2B"))
    assert ac.get("/api/tasks?scope=bogus").status_code == 422
    assert ac.get("/api/tasks?sort=password").status_code == 422
    assert mk(ac, title="Zebra search target") and ac.get("/api/tasks?q=zebra").json()["total"] == 1


def test_state_machine_and_terminal_rules(ac):
    n = mk(ac)["number"]
    assert move(ac, n, "open").status_code == 422
    r = move(ac, n, "blocked", blocked_reason="Waiting on landlord").json()
    assert r["blocked_reason"] == "Waiting on landlord"
    assert move(ac, n, "in_progress").json()["blocked_reason"] is None
    done = move(ac, n, "completed").json()
    assert done["completed_at"] and done["state"] == "completed"
    assert ac.patch(f"/api/tasks/{n}", json={"title": "Edited after done"}).status_code == 409
    assert move(ac, n, "in_progress").status_code == 409          # only reopen allowed
    assert move(ac, n, "open").json()["completed_at"] is None
    assert move(ac, n, "cancelled").status_code == 200
    assert move(ac, n, "open").status_code == 200


def test_dependencies_block_and_no_cycles(ac):
    a, b, c = (mk(ac, title=f"Step {x} of the job")["number"] for x in "abc")
    assert ac.post(f"/api/tasks/{b}/dependencies", json={"depends_on": a}).status_code == 201
    assert ac.post(f"/api/tasks/{b}/dependencies", json={"depends_on": a}).status_code == 409
    assert ac.post(f"/api/tasks/{b}/dependencies", json={"depends_on": b}).status_code == 422
    assert ac.post(f"/api/tasks/{a}/dependencies", json={"depends_on": b}).status_code == 422   # direct loop
    assert ac.post(f"/api/tasks/{c}/dependencies", json={"depends_on": b}).status_code == 201
    assert ac.post(f"/api/tasks/{a}/dependencies", json={"depends_on": c}).status_code == 422   # indirect loop
    assert ac.get(f"/api/tasks/{b}").json()["is_blocked_by_dependency"] is True
    r = move(ac, b, "completed")
    assert r.status_code == 409 and a in r.json()["detail"]
    assert move(ac, b, "in_progress").status_code == 409
    move(ac, a, "completed")
    assert move(ac, b, "completed").status_code == 200
    d = ac.get(f"/api/tasks/{b}").json()
    assert [x["number"] for x in d["blocked_by"]] == [a] and [x["number"] for x in d["blocks"]] == [c]
    assert ac.delete(f"/api/tasks/{c}/dependencies/{b}").status_code == 200


def test_checklist_crud_and_audit(ac):
    n = mk(ac)["number"]
    item = ac.post(f"/api/tasks/{n}/checklist", json={"text": "Gather quotes"}).json()
    assert ac.patch(f"/api/tasks/{n}/checklist/{item['id']}", json={"done": True}).json()["done"] is True
    d = ac.get(f"/api/tasks/{n}").json()
    assert (d["checklist_done"], d["checklist_total"]) == (1, 1)
    assert ac.delete(f"/api/tasks/{n}/checklist/{item['id']}").status_code == 204
    assert ac.patch(f"/api/tasks/{n}/checklist/{item['id']}", json={"done": False}).status_code == 404
    actions = [x["action"] for x in ac.get(f"/api/tasks/{n}/activity").json()]
    assert {"checklist_added", "checklist_done", "checklist_removed"} <= set(actions)


def test_recurring_task_spawns_exactly_once(ac):
    t = mk(ac, title="Clean the filters", due_date=iso(-1), recurrence_frequency="weekly", recurrence_interval=2, checklist=["Rinse", "Dry"])
    first = move(ac, t["number"], "completed").json()
    nxt = first["follow_up"]
    assert nxt and nxt != t["number"]
    n = ac.get(f"/api/tasks/{nxt}").json()
    assert n["state"] == "open" and n["recurrence"] == {"frequency": "weekly", "interval": 2}
    assert [c["done"] for c in n["checklist"]] == [False, False] and len(n["checklist"]) == 2
    assert datetime.fromisoformat(n["due_date"].replace("Z", "+00:00") if n["due_date"].endswith("Z") or "+" in n["due_date"] else n["due_date"] + "+00:00") > datetime.now(timezone.utc)
    move(ac, t["number"], "open")
    assert move(ac, t["number"], "completed").json()["follow_up"] is None        # no duplicate


def test_comments_and_attachments(ac):
    n = mk(ac)["number"]
    ac.post(f"/api/tasks/{n}/comments", json={"body": "Left a voicemail"})
    tl = [x for x in ac.get(f"/api/tasks/{n}/activity").json() if x["comment"]]
    assert tl[0]["comment"]["body"] == "Left a voicemail"
    up = ac.post(f"/api/tasks/{n}/attachments", files={"file": ("quote.txt", io.BytesIO(b"120 dollars"))})
    assert up.status_code == 201 and len(ac.get(f"/api/tasks/{n}/attachments").json()) == 1
    assert ac.post(f"/api/tasks/{n}/attachments", files={"file": ("x.exe", io.BytesIO(b"MZ"))}).status_code == 415
