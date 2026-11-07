from datetime import date, datetime, timedelta, timezone
import io
import pytest
from sqlalchemy import select
from app import db as dbmod
from app.models import ActivityLog
from app.services import maintenance as msvc
from tests.helpers import PARTNER, ensure_partner, login_as
from tests.test_incidents import ac, new as new_incident  # noqa: F401


@pytest.fixture(autouse=True)
def _partner(client):
    ensure_partner(client)


def asset(ac, **kw):
    r = ac.post("/api/assets", json={"name": "Washing machine", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def days(n):
    return (date.today() + timedelta(days=n)).isoformat()


def when(n):
    return (datetime.now(timezone.utc) + timedelta(days=n)).isoformat()


def sched(ac, **kw):
    r = ac.post("/api/maintenance/schedules", json={"name": "Clean the filter", "frequency": "monthly", "first_due": when(2), "lead_days": 3, **kw})
    assert r.status_code == 201, r.text
    return r.json()


def test_asset_crud_validation_and_categories(ac):
    cats = ac.get("/api/asset-categories").json()
    assert [c["name"] for c in cats][:3] == ["Computers", "Monitors", "Phones"] and len(cats) == 8
    a = asset(ac, category_id=cats[3]["id"], manufacturer="LG", model="F4", serial_number="SN-1", purchase_price="499.99", purchase_date=days(-100), warranty_expires=days(265))
    assert a["number"].startswith("AST") and a["category"]["name"] == "Appliances" and a["purchase_price"] == 499.99 and a["owner"] is None
    bad = lambda **k: ac.post("/api/assets", json={"name": "Thing", **k}).status_code  # noqa: E731
    assert bad(purchase_price="-5") == 422 and bad(purchase_date=days(0), warranty_expires=days(-5)) == 422
    assert bad(condition="shiny") == 422 and bad(owner_id="00000000-0000-0000-0000-000000000000") == 422
    me = ac.get("/api/auth/me").json()["user"]["id"]
    upd = ac.patch(f"/api/assets/{a['number']}", json={"owner_id": me, "status": "in_repair", "location": "Laundry"}).json()
    assert upd["owner"]["id"] == me and upd["status"] == "in_repair"
    assert ac.patch(f"/api/assets/{a['number']}", json={"warranty_expires": days(-1000)}).status_code == 422
    log = ac.get(f"/api/assets/{a['number']}/activity").json()
    assert [x["action"] for x in log] == ["created", "updated"] and log[1]["details"]["owner"]["to"] == "Admin"


def test_warranty_status_and_filters(ac):
    exp, soon, ok = asset(ac, name="Old TV", warranty_expires=days(-10)), asset(ac, name="Fridge", warranty_expires=days(30)), asset(ac, name="Laptop", warranty_expires=days(400))
    assert (exp["warranty_status"], soon["warranty_status"], ok["warranty_status"]) == ("expired", "expiring", "active")
    assert asset(ac, name="Chair")["warranty_status"] == "none"
    nums = lambda q: {x["number"] for x in ac.get(f"/api/assets?{q}&page_size=200").json()["items"]}  # noqa: E731
    assert exp["number"] in nums("warranty=expired") and soon["number"] not in nums("warranty=expired")
    assert soon["number"] in nums("warranty=expiring") and ok["number"] not in nums("warranty=expiring")
    assert {soon["number"], ok["number"]} <= nums("warranty=active")
    assert asset(ac, name="Zebra lamp", serial_number="ZZ-99") and ac.get("/api/assets?q=ZZ-99").json()["total"] == 1
    assert ac.get("/api/assets?warranty=bogus").status_code == 422 and ac.get("/api/assets?sort=password").status_code == 422
    assert ac.get("/api/assets?owner=shared&status=in_use").json()["total"] >= 1


def test_incident_asset_link_and_history(ac):
    a = asset(ac, name="Router")
    inc = ac.post("/api/incidents", json={"short_description": "Wi-Fi keeps dropping", "asset_id": a["id"]})
    assert inc.status_code == 201 and inc.json()["asset"] == {"id": a["id"], "number": a["number"], "name": "Router"}
    assert ac.post("/api/incidents", json={"short_description": "Bad asset link", "asset_id": "00000000-0000-0000-0000-000000000000"}).status_code == 422
    other = new_incident(ac)
    assert other["asset"] is None
    linked = ac.patch(f"/api/incidents/{other['number']}", json={"asset_id": a["id"]}).json()
    assert linked["asset"]["number"] == a["number"]
    upd = [x for x in ac.get(f"/api/incidents/{other['number']}/activity").json() if x["action"] == "updated"][-1]
    assert upd["details"]["asset"] == {"from": None, "to": a["number"]}
    d = ac.get(f"/api/assets/{a['number']}").json()
    assert {i["number"] for i in d["incidents"]} == {inc.json()["number"], other["number"]}
    assert [x["action"] for x in ac.get(f"/api/assets/{a['number']}/activity").json()].count("incident_linked") == 2
    assert ac.patch(f"/api/incidents/{other['number']}", json={"asset_id": None}).json()["asset"] is None


def test_asset_attachments(ac):
    a = asset(ac, name="Dishwasher")["number"]
    assert ac.post(f"/api/assets/{a}/attachments", files={"file": ("receipt.txt", io.BytesIO(b"paid 400"))}).status_code == 201
    assert ac.post(f"/api/assets/{a}/attachments", files={"file": ("x.exe", io.BytesIO(b"MZ"))}).status_code == 415
    assert len(ac.get(f"/api/assets/{a}/attachments").json()) == 1


def test_schedule_generates_task_once_with_checklist(ac):
    a = asset(ac, name="Air conditioner")
    me = ac.get("/api/auth/me").json()["user"]["id"]
    s = sched(ac, asset_number=a["number"], assigned_to_id=me, checklist=["Remove filter", "Rinse", " "], priority=2)
    assert s["number"].startswith("MNT") and s["current_task"] and s["status"] in ("due_soon", "ok")
    t = ac.get(f"/api/tasks/{s['current_task']['number']}").json()
    assert t["source"] == "maintenance" and t["category"] == "Maintenance" and t["assigned_to"]["id"] == me and t["priority"] == 2
    assert t["parent"] == {"type": "maintenance", "number": s["number"], "title": "Clean the filter"} and "Air conditioner" in t["title"]
    assert [c["text"] for c in t["checklist"]] == ["Remove filter", "Rinse"]
    assert ac.post("/api/maintenance/generate").json()["created"] == []          # idempotent
    far = sched(ac, name="Yearly boiler service", frequency="yearly", first_due=when(200))
    assert far["current_task"] is None
    with dbmod._Session() as db:
        made = msvc.generate_due_tasks(db, now=datetime.now(timezone.utc) + timedelta(days=198))   # inside the lead window by then
        db.commit()
    assert [t.title for t in made] == ["Yearly boiler service"]
    assert ac.get(f"/api/maintenance/schedules/{far['number']}").json()["current_task"]["state"] == "open"


def test_completion_records_history_and_advances(ac):
    a = asset(ac, name="Water purifier")
    s = sched(ac, name="Replace purifier filter", asset_number=a["number"], first_due=when(1), checklist=["Swap cartridge", "Flush"])
    n = s["current_task"]["number"]
    item = ac.get(f"/api/tasks/{n}").json()["checklist"][0]
    ac.patch(f"/api/tasks/{n}/checklist/{item['id']}", json={"done": True})
    r = ac.post(f"/api/tasks/{n}/transition", json={"to": "completed"})
    assert r.status_code == 200 and r.json()["follow_up"] is None
    d = ac.get(f"/api/maintenance/schedules/{s['number']}").json()
    assert d["current_task"] is None and d["last_completed_at"] and len(d["records"]) == 1
    assert d["records"][0]["outcome"] == "completed" and d["records"][0]["notes"] == "1/2 checklist items done"
    old, new = datetime.fromisoformat(s["next_due"].replace("Z", "")), datetime.fromisoformat(d["next_due"].replace("Z", ""))
    assert 27 <= (new - old).days <= 31                                              # one month on from the old due date
    assert ac.post(f"/api/tasks/{n}/transition", json={"to": "open"}).status_code == 409   # maintenance tasks cannot be reopened
    ad = ac.get(f"/api/assets/{a['number']}").json()
    assert ad["records"][0]["schedule_name"] == "Replace purifier filter" and ad["schedules"][0]["number"] == s["number"]
    assert "maintenance_done" in [x["action"] for x in ac.get(f"/api/assets/{a['number']}/activity").json()]
    assert any(x["schedule_number"] == s["number"] for x in ac.get("/api/maintenance/records?days=30").json())
    assert ac.delete(f"/api/maintenance/schedules/{s['number']}").status_code == 409


def test_from_completion_and_skip_on_cancel(ac):
    s = sched(ac, name="Service the car", frequency="quarterly", from_completion=True, first_due=when(-20))
    n = s["current_task"]["number"]
    ac.post(f"/api/tasks/{n}/transition", json={"to": "completed"})
    nd = datetime.fromisoformat(ac.get(f"/api/maintenance/schedules/{s['number']}").json()["next_due"].replace("Z", ""))
    assert 85 <= (nd - datetime.utcnow()).days <= 93                                  # three months from completion, not from the old due date
    k = sched(ac, name="Skippable chore", frequency="weekly", first_due=when(1))
    ac.post(f"/api/tasks/{k['current_task']['number']}/transition", json={"to": "cancelled"})
    d = ac.get(f"/api/maintenance/schedules/{k['number']}").json()
    assert d["records"][0]["outcome"] == "skipped" and d["last_completed_at"] is None and d["current_task"] is None


def test_overdue_status_and_filters(ac):
    s = sched(ac, name="Neglected gutter clean", frequency="yearly", first_due=when(-5))
    assert s["status"] == "overdue" and s["current_task"]
    assert s["number"] in [x["number"] for x in ac.get("/api/maintenance/schedules?status=overdue").json()]
    assert s["number"] not in [x["number"] for x in ac.get("/api/maintenance/schedules?status=upcoming").json()]
    off = ac.patch(f"/api/maintenance/schedules/{s['number']}", json={"is_active": False}).json()
    assert off["status"] == "inactive" and s["number"] in [x["number"] for x in ac.get("/api/maintenance/schedules?status=inactive").json()]
    assert ac.get("/api/maintenance/schedules?status=bogus").status_code == 422
    assert ac.post("/api/maintenance/schedules", json={"name": "x", "frequency": "hourly", "first_due": when(1)}).status_code == 422


def test_schedule_edit_and_delete(ac):
    a = asset(ac, name="Dehumidifier")
    s = sched(ac, name="Empty the tank", frequency="weekly", first_due=when(40), checklist=["Empty"])
    u = ac.patch(f"/api/maintenance/schedules/{s['number']}", json={"asset_number": a["number"], "checklist": ["Empty", "Wipe"], "interval": 2}).json()
    assert u["asset"]["number"] == a["number"] and u["checklist"] == ["Empty", "Wipe"] and u["interval"] == 2
    assert ac.patch(f"/api/maintenance/schedules/{s['number']}", json={"asset_number": "AST999999"}).status_code == 422
    assert ac.patch(f"/api/maintenance/schedules/{s['number']}", json={"interval": None}).status_code == 422
    log = [x["action"] for x in ac.get(f"/api/maintenance/schedules/{s['number']}/activity").json()]
    assert log == ["created", "updated"]
    assert ac.delete(f"/api/maintenance/schedules/{s['number']}").status_code == 204
    assert ac.get(f"/api/maintenance/schedules/{s['number']}").status_code == 404
