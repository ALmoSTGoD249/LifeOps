import io
import json
import pytest
from sqlalchemy import select
from app import db as dbmod
from app.models import ActivityLog
from app.models_kb import ArticleSecret
from app.services import crypto
from tests.helpers import ADMIN, PARTNER, ensure_partner, login_as
from tests.test_incidents import ac  # noqa: F401


@pytest.fixture(autouse=True)
def _partner(client):
    ensure_partner(client)


def article(ac, **kw):
    r = ac.post("/api/kb/articles", json={"title": "Router troubleshooting", "body": "## Steps\n1. Reboot", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def nums(c, q=""):
    return {a["number"] for a in c.get(f"/api/kb/articles?page_size=100{q}").json()["items"]}


def test_categories_create_and_tag_normalization(ac):
    assert [c["name"] for c in ac.get("/api/kb/categories").json()][:2] == ["Troubleshooting", "Appliances"]
    cat = ac.get("/api/kb/categories").json()[0]
    a = article(ac, category_id=cat["id"], tags=["Wi-Fi", " wi fi ", "ROUTER", ""], status="published")
    assert a["number"].startswith("KB") and a["tags"] == ["router", "wi-fi"] and a["category"]["name"] == "Troubleshooting"
    assert ac.post("/api/kb/articles", json={"title": "ab"}).status_code == 422
    assert ac.post("/api/kb/articles", json={"title": "Valid title", "category_id": "00000000-0000-0000-0000-000000000000"}).status_code == 422


def test_draft_visibility_and_publish(ac):
    a = article(ac, title="Admin draft notes")                  # draft by admin
    login_as(ac, PARTNER)
    assert a["number"] not in nums(ac) and ac.get(f"/api/kb/articles/{a['number']}").status_code == 404
    mine = article(ac, title="Partner draft", status="draft")
    assert mine["number"] in nums(ac)
    login_as(ac, ADMIN)
    assert {a["number"], mine["number"]} <= nums(ac)            # admins see all
    login_as(ac, PARTNER)
    assert ac.patch(f"/api/kb/articles/{mine['number']}", json={"status": "published"}).json()["status"] == "published"
    login_as(ac, ADMIN)
    pub = ac.patch(f"/api/kb/articles/{a['number']}", json={"status": "published", "title": "Admin published notes"}).json()
    login_as(ac, PARTNER)
    assert pub["number"] in nums(ac) and ac.get(f"/api/kb/articles/{pub['number']}").json()["title"] == "Admin published notes"


def test_admins_only_articles_are_invisible_to_members(ac):
    a = article(ac, title="Admin only procedure", status="published", admins_only=True, tags=["classified"])
    login_as(ac, PARTNER)
    assert a["number"] not in nums(ac) and ac.get(f"/api/kb/articles/{a['number']}").status_code == 404
    assert "classified" not in [t["tag"] for t in ac.get("/api/kb/tags").json()]
    assert ac.get("/api/kb/articles?q=classified").json()["total"] == 0
    assert ac.post("/api/kb/articles", json={"title": "Try restricting", "admins_only": True}).status_code == 403
    assert ac.patch(f"/api/kb/articles/{a['number']}", json={"admins_only": False}).status_code == 404
    mine = article(ac, title="Partner published", status="published")
    assert ac.patch(f"/api/kb/articles/{mine['number']}", json={"admins_only": True}).status_code == 403


def test_secrets_never_leak_and_are_encrypted_and_audited(ac):
    pw = "correct-horse-STAPLE-9142"
    a = article(ac, title="Home Wi-Fi", status="published", secrets=[{"label": "Wi-Fi password", "value": pw}, {"label": "Alarm code", "value": "4821"}])
    assert [s["label"] for s in a["secrets"]] == ["Wi-Fi password", "Alarm code"] and a["secret_count"] == 2
    for resp in (ac.get(f"/api/kb/articles/{a['number']}"), ac.get("/api/kb/articles?q=wi-fi"), ac.get(f"/api/kb/articles/{a['number']}/activity")):
        assert pw not in resp.text and "4821" not in resp.text
    with dbmod._Session() as db:
        stored = [s.value_encrypted for s in db.scalars(select(ArticleSecret))]
    assert stored and all(pw not in v and "4821" not in v for v in stored)
    sid = a["secrets"][0]["id"]
    r = ac.post(f"/api/kb/articles/{a['number']}/secrets/{sid}/reveal")
    assert r.status_code == 200 and r.json() == {"label": "Wi-Fi password", "value": pw}
    ev = [x for x in ac.get(f"/api/kb/articles/{a['number']}/activity").json() if x["action"] == "secret_revealed"]
    assert ev and ev[0]["details"] == {"label": "Wi-Fi password"} and ev[0]["user_name"] == "Admin"
    csrf = ac.headers.pop("X-CSRF-Token")
    assert ac.post(f"/api/kb/articles/{a['number']}/secrets/{sid}/reveal").status_code == 403    # CSRF protected
    ac.headers["X-CSRF-Token"] = csrf
    assert ac.get(f"/api/kb/articles/{a['number']}/secrets/{sid}/reveal").status_code in (404, 405)
    # change, duplicate, remove
    assert ac.patch(f"/api/kb/articles/{a['number']}/secrets/{sid}", json={"value": "new-secret-value"}).status_code == 200
    assert ac.post(f"/api/kb/articles/{a['number']}/secrets/{sid}/reveal").json()["value"] == "new-secret-value"
    assert ac.post(f"/api/kb/articles/{a['number']}/secrets", json={"label": "alarm CODE", "value": "x"}).status_code == 409
    assert ac.post("/api/kb/articles", json={"title": "Dup labels", "secrets": [{"label": "a", "value": "1"}, {"label": "A", "value": "2"}]}).status_code == 422
    assert ac.delete(f"/api/kb/articles/{a['number']}/secrets/{a['secrets'][1]['id']}").status_code == 204


def test_secret_access_follows_article_visibility(ac):
    a = article(ac, title="Admin only vault", status="published", admins_only=True, secrets=[{"label": "Safe", "value": "1234"}])
    sid = a["secrets"][0]["id"]
    login_as(ac, PARTNER)
    assert ac.post(f"/api/kb/articles/{a['number']}/secrets/{sid}/reveal").status_code == 404
    login_as(ac, ADMIN)
    open_ = article(ac, title="Shared Wi-Fi", status="published", secrets=[{"label": "Guest", "value": "guestpass"}])
    login_as(ac, PARTNER)
    assert ac.post(f"/api/kb/articles/{open_['number']}/secrets/{open_['secrets'][0]['id']}/reveal").json()["value"] == "guestpass"
    assert ac.post(f"/api/kb/articles/{open_['number']}/secrets/{sid}/reveal").status_code == 404       # id from another article


def test_search_tags_and_filters(ac):
    cat = ac.get("/api/kb/categories").json()[1]
    a = article(ac, title="Dishwasher error E4", body="Check the inlet valve", tags=["dishwasher", "errors"], category_id=cat["id"], status="published")
    article(ac, title="Unrelated draft", body="nothing", status="draft")
    assert a["number"] in nums(ac, "&q=inlet") and a["number"] in nums(ac, "&q=dishwasher") and a["number"] in nums(ac, "&tag=errors")
    assert a["number"] in nums(ac, f"&category_id={cat['id']}") and a["number"] not in nums(ac, "&status=draft")
    assert ac.get("/api/kb/articles?sort=password").status_code == 422 and ac.get("/api/kb/articles?status=zzz").status_code == 422
    assert {"tag": "dishwasher", "count": 1} in ac.get("/api/kb/tags").json()
    up = ac.patch(f"/api/kb/articles/{a['number']}", json={"tags": ["appliance"]}).json()
    assert up["tags"] == ["appliance"] and up["updated_by"]["full_name"] == "Admin"
    log = ac.get(f"/api/kb/articles/{a['number']}/activity").json()
    assert log[-1]["action"] == "updated" and "tags" in log[-1]["details"]


def test_attachments_delete_and_crypto(ac):
    a = article(ac, status="published")
    assert ac.post(f"/api/kb/articles/{a['number']}/attachments", files={"file": ("manual.txt", io.BytesIO(b"hello"))}).status_code == 201
    assert len(ac.get(f"/api/kb/articles/{a['number']}/attachments").json()) == 1
    login_as(ac, PARTNER)
    assert ac.delete(f"/api/kb/articles/{a['number']}").status_code == 403         # not the author
    login_as(ac, ADMIN)
    assert ac.delete(f"/api/kb/articles/{a['number']}").status_code == 204 and ac.get(f"/api/kb/articles/{a['number']}").status_code == 404
    assert crypto.decrypt(crypto.encrypt("héllo ✓")) == "héllo ✓"
    with pytest.raises(ValueError):
        crypto.decrypt("not-a-valid-token")
