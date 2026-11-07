import io
import os
import pytest
from app.routers import auth as auth_router

ADMIN = {"email": "admin@example.com", "password": "correct-horse-battery"}


@pytest.fixture()
def ac(client):
    """Client logged in as admin, with CSRF header applied."""
    auth_router._attempts.clear()
    client.cookies.clear()
    r = client.post("/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    yield client
    client.headers.pop("X-CSRF-Token", None)


def new(ac, **kw):
    r = ac.post("/api/incidents", json={"short_description": "Washing machine leaking", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_numbers_and_priority(ac):
    a, b = new(ac, impact=1, urgency=1), new(ac, impact=3, urgency=3)
    assert a["number"].startswith("INC") and len(a["number"]) == 9 and a["number"] != b["number"]
    assert (a["priority"], b["priority"]) == (1, 4) and a["state"] == "new"
    assert a["reported_by"]["full_name"] == "Admin"


def test_validation(ac):
    assert ac.post("/api/incidents", json={"short_description": "x"}).status_code == 422
    assert ac.post("/api/incidents", json={"short_description": "valid one", "impact": 9}).status_code == 422


def test_edit_recalculates_priority_and_audits(ac):
    inc = new(ac, impact=3, urgency=3)
    r = ac.patch(f"/api/incidents/{inc['number']}", json={"impact": 1, "urgency": 2})
    assert r.json()["priority"] == 2
    tl = ac.get(f"/api/incidents/{inc['number']}/activity").json()
    upd = [t for t in tl if t["action"] == "updated"][0]
    assert upd["details"]["priority"] == {"from": 4, "to": 2}


def test_category_must_match_subcategory(ac):
    cats = ac.get("/api/incident-categories").json()
    net, app = cats[0], cats[1]
    ok = new(ac, category_id=net["id"], subcategory_id=net["children"][0]["id"])
    assert ok["subcategory"]["name"] == net["children"][0]["name"]
    bad = ac.post("/api/incidents", json={"short_description": "mismatch", "category_id": net["id"], "subcategory_id": app["children"][0]["id"]})
    assert bad.status_code == 422
    # changing category clears the stale subcategory
    r = ac.patch(f"/api/incidents/{ok['number']}", json={"category_id": app["id"]}).json()
    assert r["category"]["name"] == app["name"] and r["subcategory"] is None


def test_workflow_and_resolution_rules(ac):
    n = new(ac)["number"]
    t = lambda **b: ac.post(f"/api/incidents/{n}/transition", json=b)  # noqa: E731
    assert t(to="closed").status_code == 409            # cannot skip resolve
    assert t(to="on_hold").status_code == 422           # needs a reason
    assert t(to="on_hold", hold_reason="Waiting for parts").json()["hold_reason"] == "Waiting for parts"
    assert t(to="in_progress").json()["hold_reason"] is None
    assert t(to="resolved").status_code == 422          # needs code + notes
    r = t(to="resolved", resolution_code="fixed", resolution_notes="Replaced hose").json()
    assert r["resolved_at"] and r["state"] == "resolved"
    re_ = t(to="in_progress").json()                    # reopen
    assert re_["resolved_at"] is None
    t(to="resolved", resolution_code="fixed", resolution_notes="Fixed again")
    c = t(to="closed").json()
    assert c["closed_at"]
    assert t(to="in_progress").status_code == 409       # closed is terminal
    assert ac.patch(f"/api/incidents/{n}", json={"location": "Kitchen"}).status_code == 409
    actions = [x["action"] for x in ac.get(f"/api/incidents/{n}/activity").json()]
    assert {"created", "state_changed", "resolved", "reopened", "closed"} <= set(actions)


def test_comments_and_work_notes_in_timeline(ac):
    n = new(ac)["number"]
    assert ac.post(f"/api/incidents/{n}/comments", json={"body": ""}).status_code == 422
    ac.post(f"/api/incidents/{n}/comments", json={"body": "Called the plumber"})
    ac.post(f"/api/incidents/{n}/comments", json={"kind": "work_note", "body": "Quote is 120"})
    tl = [t for t in ac.get(f"/api/incidents/{n}/activity").json() if t["comment"]]
    assert [(t["comment"]["kind"], t["comment"]["body"]) for t in tl] == [("comment", "Called the plumber"), ("work_note", "Quote is 120")]


def test_list_filter_sort_page(ac):
    new(ac, short_description="Unique zebra problem", impact=1, urgency=1)
    r = ac.get("/api/incidents?q=zebra").json()
    assert r["total"] == 1 and r["items"][0]["short_description"] == "Unique zebra problem"
    p = ac.get("/api/incidents?sort=priority&order=asc&page_size=2").json()
    assert len(p["items"]) == 2 and p["items"][0]["priority"] <= p["items"][1]["priority"] and p["total"] > 2
    assert ac.get("/api/incidents?priority=1&state=open").json()["total"] >= 1
    assert ac.get("/api/incidents?sort=password").status_code == 422
    assert ac.get("/api/incidents?assigned_to=unassigned").status_code == 200


def test_assignment_and_bulk(ac):
    me = ac.get("/api/auth/me").json()["user"]["id"]
    a, b = new(ac)["number"], new(ac)["number"]
    r = ac.post("/api/incidents/bulk", json={"numbers": [a, b, "INC999999"], "action": "assign", "assigned_to_id": me}).json()
    assert sorted(r["updated"]) == sorted([a, b]) and r["failed"][0]["number"] == "INC999999"
    assert ac.get(f"/api/incidents/{a}").json()["assigned_to"]["id"] == me
    assert ac.post("/api/incidents/bulk", json={"numbers": [a], "action": "transition", "to": "resolved"}).status_code == 422
    r = ac.post("/api/incidents/bulk", json={"numbers": [a, b], "action": "transition", "to": "cancelled"}).json()
    assert len(r["updated"]) == 2
    r = ac.post("/api/incidents/bulk", json={"numbers": [a], "action": "transition", "to": "in_progress"}).json()
    assert r["failed"] and not r["updated"]
    assert ac.get("/api/incidents?assigned_to=me&state=cancelled").json()["total"] >= 2


def test_priority_matrix_admin_configurable(ac):
    cells = ac.get("/api/incident-meta").json()["priority_matrix"]
    assert len(cells) == 9
    changed = [{**c, "priority": 1} if (c["impact"], c["urgency"]) == (3, 3) else c for c in cells]
    assert ac.put("/api/admin/priority-matrix", json=changed[:8]).status_code == 422
    assert ac.put("/api/admin/priority-matrix", json=changed).status_code == 200
    assert new(ac, impact=3, urgency=3)["priority"] == 1
    assert ac.put("/api/admin/priority-matrix", json=cells).status_code == 200   # restore
    assert new(ac, impact=3, urgency=3)["priority"] == 4


def test_matrix_forbidden_for_standard_user(client):
    auth_router._attempts.clear()
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "p@example.com", "password": "brand-new-password"})
    assert r.status_code == 200
    h = {"X-CSRF-Token": r.json()["csrf_token"]}
    assert client.put("/api/admin/priority-matrix", json=[], headers=h).status_code == 403


def test_attachments_validation_and_download(ac):
    n = new(ac)["number"]
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    up = lambda name, data: ac.post(f"/api/incidents/{n}/attachments", files={"file": (name, io.BytesIO(data))})  # noqa: E731
    r = up("../../evil name.png", png)
    assert r.status_code == 201 and "/" not in r.json()["name"]
    assert up("script.exe", b"MZ").status_code == 415
    assert up("fake.png", b"<html>not a png</html>").status_code == 415
    assert up("empty.txt", b"").status_code == 422
    assert up("note.txt", b"hello").status_code == 201
    listing = ac.get(f"/api/incidents/{n}/attachments").json()
    assert len(listing) == 2
    d = ac.get(f"/api/attachments/{listing[0]['id']}")
    assert d.status_code == 200 and d.content == png
    assert "attachment" in d.headers["content-disposition"] and d.headers["x-content-type-options"] == "nosniff"
    ac.cookies.clear()
    assert ac.get(f"/api/attachments/{listing[0]['id']}").status_code == 401
