import pytest
from tests.helpers import PARTNER, ensure_partner, login_as
from tests.test_incidents import ac  # noqa: F401


@pytest.fixture(autouse=True)
def _partner(client):
    ensure_partner(client)


def item(ac, name):
    return next(i for i in ac.get("/api/catalog/items").json() if i["name"] == name)


def full(ac, name):
    return ac.get(f"/api/catalog/items/{item(ac, name)['id']}").json()


def submit(ac, name, data=None, **kw):
    r = ac.post("/api/requests", json={"items": [{"item_id": item(ac, name)["id"], "form_data": data or {}}], **kw})
    return r


APPLIANCE = {"appliance": "Washing machine", "issue": "Drum will not spin"}


def test_seeded_catalog(ac):
    cats = ac.get("/api/catalog/categories").json()
    assert [c["name"] for c in cats] == ["Household", "Personal", "Technology", "Shared Life"]
    assert len(ac.get("/api/catalog/items").json()) == 17
    a = full(ac, "Request appliance servicing")
    assert [t["title"] for t in a["tasks"]] == ["Contact service provider", "Schedule appointment", "Confirm repair completed"]
    assert full(ac, "Request furniture purchase")["approval_required"] is True


def test_form_validation_is_server_side(ac):
    r = submit(ac, "Request appliance servicing", {})
    assert r.status_code == 422 and set(r.json()["detail"]["form_errors"]) == {"appliance", "issue"}
    r = submit(ac, "Request appliance servicing", {**APPLIANCE, "hacker": "x", "preferred_date": "not-a-date"})
    assert set(r.json()["detail"]["form_errors"]) == {"hacker", "preferred_date"}
    assert submit(ac, "Request home repairs", {"what": "Door", "severity": "Catastrophic"}).status_code == 422
    assert submit(ac, "Request furniture purchase", {"item": "Desk", "budget": "lots"}).status_code == 422
    assert submit(ac, "Request household supplies", {"items": "Milk", "urgent": "yes"}).status_code == 422


def test_request_creates_req_ritm_sctask_chain(ac):
    r = submit(ac, "Request appliance servicing", {**APPLIANCE, "preferred_date": "2026-12-01"}, justification="It is flooding")
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["number"].startswith("REQ") and req["state"] == "in_progress" and len(req["ritms"]) == 1
    ritm = req["ritms"][0]
    assert ritm["number"].startswith("RITM") and ritm["state"] == "open" and ritm["item_name"] == "Request appliance servicing"
    assert [f["label"] for f in ritm["form"]][:2] == ["Appliance", "What is wrong?"]
    states = [t["state"] for t in ritm["tasks"]]
    assert states == ["open", "pending", "pending"] and all(t["number"].startswith("SCTASK") for t in ritm["tasks"])
    assert all(t["assigned_to"]["full_name"] == "Admin" for t in ritm["tasks"])      # requester mode
    assert ritm["due_date"]
    assert ac.get(f"/api/ritms/{ritm['number']}").json()["request_number"] == req["number"]


def test_sequential_fulfillment_and_confirmation(ac):
    req = submit(ac, "Request appliance servicing", APPLIANCE).json()
    r, tasks = req["ritms"][0], req["ritms"][0]["tasks"]
    mv = lambda n, to: ac.post(f"/api/sctasks/{n}/transition", json={"to": to})  # noqa: E731
    assert mv(tasks[1]["number"], "in_progress").status_code == 409            # still pending
    assert mv(tasks[0]["number"], "in_progress").json()["ritm_state"] == "in_progress"
    mv(tasks[0]["number"], "completed")
    assert ac.get(f"/api/ritms/{r['number']}").json()["tasks"][1]["state"] == "open"   # next unlocked
    assert mv(tasks[0]["number"], "open").status_code == 409                   # completed is final
    mv(tasks[1]["number"], "completed")
    assert mv(tasks[2]["number"], "completed").json()["ritm_state"] == "awaiting_confirmation"
    assert ac.post(f"/api/ritms/{r['number']}/confirm", json={"accepted": False}).status_code == 422
    back = ac.post(f"/api/ritms/{r['number']}/confirm", json={"accepted": False, "comment": "Still leaking"}).json()
    assert back["state"] == "in_progress"
    assert ac.post(f"/api/ritms/{r['number']}/fulfill").json()["state"] == "awaiting_confirmation"
    done = ac.post(f"/api/ritms/{r['number']}/confirm", json={"accepted": True}).json()
    assert done["state"] == "completed" and done["completed_at"]
    assert ac.get(f"/api/requests/{req['number']}").json()["state"] == "completed"


def test_approval_flow_approve(ac):
    req = submit(ac, "Request furniture purchase", {"item": "Desk", "budget": 250}).json()
    r = req["ritms"][0]
    assert req["state"] == "awaiting_approval" and r["state"] == "pending_approval" and r["tasks"] == []
    assert r["approvals"][0]["state"] == "requested" and r["approvals"][0]["approver"]["full_name"] != "Admin"
    partner = login_as(ac, PARTNER)
    pend = [a for a in ac.get("/api/approvals").json() if a["request_number"] == req["number"]]
    assert pend and pend[0]["form"][0]["value"] == "Desk"
    assert ac.get("/api/my-work").json()["approvals"]
    d = ac.post(f"/api/approvals/{pend[0]['id']}/decision", json={"decision": "approve", "comment": "Go ahead"})
    assert d.status_code == 200 and d.json()["state"] == "approved"
    assert ac.post(f"/api/approvals/{pend[0]['id']}/decision", json={"decision": "approve"}).status_code == 409   # already decided
    got = ac.get(f"/api/requests/{req['number']}").json()
    assert got["state"] == "in_progress" and got["ritms"][0]["state"] == "open" and len(got["ritms"][0]["tasks"]) == 4
    assert partner["email"] == "p@example.com"


def test_approval_reject_and_permissions(ac):
    req = submit(ac, "Request a shared purchase", {"item": "Blender", "amount": 80}).json()
    ap = req["ritms"][0]["approvals"][0]["id"]
    ac.post("/api/users", json={"email": "third@example.com", "full_name": "Third", "password": "third-long-password"})
    login_as(ac, {"email": "third@example.com", "password": "third-long-password"})
    assert ac.post(f"/api/approvals/{ap}/decision", json={"decision": "approve"}).status_code == 403
    login_as(ac, PARTNER)
    assert ac.post(f"/api/approvals/{ap}/decision", json={"decision": "reject"}).status_code == 422   # reason required
    assert ac.post(f"/api/approvals/{ap}/decision", json={"decision": "reject", "comment": "Too pricey"}).status_code == 200
    got = ac.get(f"/api/requests/{req['number']}").json()
    assert got["state"] == "rejected" and got["ritms"][0]["state"] == "rejected" and got["closed_at"]


def test_cancel_request_rules(ac):
    req = submit(ac, "Request cleaning", {"cleaning_type": "Deep clean"}).json()
    login_as(ac, PARTNER)
    assert ac.post(f"/api/requests/{req['number']}/cancel").status_code == 403      # not the requester, not admin
    login_as(ac, {"email": "admin@example.com", "password": "correct-horse-battery"})
    c = ac.post(f"/api/requests/{req['number']}/cancel").json()
    assert c["state"] == "cancelled" and c["ritms"][0]["state"] == "cancelled" and {t["state"] for t in c["ritms"][0]["tasks"]} == {"cancelled"}
    assert ac.post(f"/api/requests/{req['number']}/cancel").status_code == 409


def test_catalog_builder_and_validation(ac):
    cat = ac.get("/api/catalog/categories").json()[0]
    body = {"category_id": cat["id"], "name": "Water the plants", "description": "While away", "icon": "leaf", "estimated_hours": 4, "sequential": False,
            "fields": [{"key": "plants", "label": "Which plants?", "field_type": "text", "required": True},
                       {"key": "amount", "label": "How much?", "field_type": "select", "options": ["A little", "A lot"]}],
            "tasks": [{"title": "Water them", "assignee_mode": "other_member"}, {"title": "Send a photo", "assignee_mode": "requester"}]}
    bad = lambda **o: ac.post("/api/catalog/items", json={**body, **o}).status_code  # noqa: E731
    assert bad(fields=[{"key": "Bad Key", "label": "x", "field_type": "text"}]) == 422
    assert bad(fields=[{"key": "a", "label": "x", "field_type": "select"}]) == 422          # dropdown without options
    assert bad(fields=[{"key": "a", "label": "x", "field_type": "text"}, {"key": "a", "label": "y", "field_type": "text"}]) == 422
    assert bad(tasks=[{"title": "Do it", "assignee_mode": "user"}]) == 422
    created = ac.post("/api/catalog/items", json=body)
    assert created.status_code == 201, created.text
    iid = created.json()["id"]
    r = ac.post("/api/requests", json={"items": [{"item_id": iid, "form_data": {"plants": "Ferns", "amount": "A lot"}}]}).json()
    assert [t["state"] for t in r["ritms"][0]["tasks"]] == ["open", "open"]            # parallel
    assert r["ritms"][0]["tasks"][0]["assigned_to"]["full_name"] != "Admin"            # other_member
    # edit: drop a field, rename the other, add one
    upd = {**body, "fields": [{"key": "plants", "label": "Which plant(s)?", "field_type": "text", "required": True}, {"key": "notes", "label": "Notes", "field_type": "textarea"}], "tasks": body["tasks"][:1]}
    out = ac.put(f"/api/catalog/items/{iid}", json=upd).json()
    assert [f["key"] for f in out["fields"]] == ["plants", "notes"] and out["fields"][0]["label"] == "Which plant(s)?" and len(out["tasks"]) == 1
    assert ac.delete(f"/api/catalog/items/{iid}").status_code == 409                    # has been requested
    # snapshot: the old request still shows the labels it was submitted with
    assert ac.get(f"/api/requests/{r['number']}").json()["ritms"][0]["form"][0]["label"] == "Which plants?"
    # inactive items are hidden from members and cannot be requested
    ac.put(f"/api/catalog/items/{iid}", json={**upd, "is_active": False})
    assert iid not in [i["id"] for i in ac.get("/api/catalog/items").json()]
    assert iid in [i["id"] for i in ac.get("/api/catalog/items?include_inactive=true").json()]
    assert ac.post("/api/requests", json={"items": [{"item_id": iid, "form_data": {"plants": "x"}}]}).status_code == 422
    login_as(ac, PARTNER)
    assert ac.put(f"/api/catalog/items/{iid}", json=upd).status_code == 403
    assert ac.get(f"/api/catalog/items/{iid}").status_code == 404
    assert ac.get("/api/catalog/items?include_inactive=true").status_code == 403


def test_item_without_tasks_uses_manual_fulfillment_and_empty_category_delete(ac):
    c = ac.post("/api/catalog/categories", json={"name": "Pets"}).json()
    assert ac.post("/api/catalog/categories", json={"name": "pets"}).status_code == 409
    it = ac.post("/api/catalog/items", json={"category_id": c["id"], "name": "Book the vet", "fields": [], "tasks": []}).json()
    assert ac.delete(f"/api/catalog/categories/{c['id']}").status_code == 409           # has an item
    req = ac.post("/api/requests", json={"items": [{"item_id": it["id"]}]}).json()
    n = req["ritms"][0]["number"]
    assert req["ritms"][0]["tasks"] == [] and ac.post(f"/api/ritms/{n}/fulfill").json()["state"] == "awaiting_confirmation"


def test_multi_item_request_rolls_up_state_and_timeline(ac):
    ids = [item(ac, n)["id"] for n in ("Request cleaning", "Request household supplies")]
    req = ac.post("/api/requests", json={"items": [{"item_id": ids[0], "form_data": {"cleaning_type": "Regular"}}, {"item_id": ids[1], "form_data": {"items": "Milk"}}]}).json()
    assert len(req["ritms"]) == 2 and req["short_description"] == "Request cleaning, Request household supplies"
    t = req["ritms"][0]["tasks"][0]["number"]
    ac.post(f"/api/records/sctask/{t}/comments", json={"body": "Booked for Friday"})
    ac.post(f"/api/records/request/{req['number']}/comments", json={"body": "Thanks!"})
    assert ac.post(f"/api/records/bogus/{t}/comments", json={"body": "x"}).status_code == 404
    tl = ac.get(f"/api/requests/{req['number']}/activity").json()
    kinds = {(e["record_type"]) for e in tl}
    assert kinds == {"request", "ritm", "sctask"}
    assert {e["comment"]["body"] for e in tl if e["comment"]} == {"Booked for Friday", "Thanks!"}
    mine = ac.get("/api/requests?scope=mine").json()
    assert mine["total"] >= 1 and mine["items"][0]["ritms"]
    assert ac.get("/api/sctasks?scope=mine").json()["total"] >= 1
