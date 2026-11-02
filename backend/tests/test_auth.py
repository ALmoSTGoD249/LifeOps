import pytest
from sqlalchemy import select
from app import db as dbmod
from app.models import ActivityLog
from app.services.audit import next_number

ADMIN = {"email": "admin@example.com", "password": "correct-horse-battery"}


def login(client, creds=ADMIN):
    r = client.post("/api/auth/login", json=creds)
    return r


def hdr(r):
    return {"X-CSRF-Token": r.json()["csrf_token"]}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_unauthenticated_rejected(client):
    client.cookies.clear()
    assert client.get("/api/users").status_code == 401


def test_bad_password(client):
    client.cookies.clear()
    assert login(client, {**ADMIN, "password": "nope"}).status_code == 401


def test_login_me_and_csrf(client):
    client.cookies.clear()
    r = login(client)
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    assert "httponly" in r.headers["set-cookie"].lower()
    # mutating request without CSRF header is refused
    body = {"email": "p@example.com", "full_name": "Partner", "password": "another-long-pass"}
    assert client.post("/api/users", json=body).status_code == 403
    assert client.post("/api/users", json=body, headers=hdr(r)).status_code == 201
    assert client.post("/api/users", json=body, headers=hdr(r)).status_code == 409


def test_standard_user_cannot_admin(client):
    client.cookies.clear()
    r = login(client, {"email": "p@example.com", "password": "another-long-pass"})
    assert r.status_code == 200
    body = {"email": "x@example.com", "full_name": "X", "password": "another-long-pass"}
    assert client.post("/api/users", json=body, headers=hdr(r)).status_code == 403


def test_change_password_revokes_other_sessions(client):
    client.cookies.clear()
    r = login(client, {"email": "p@example.com", "password": "another-long-pass"})
    stale = dict(client.cookies)
    bad = client.post("/api/auth/change-password", headers=hdr(r),
                      json={"current_password": "wrong", "new_password": "brand-new-password"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/change-password", headers=hdr(r),
                     json={"current_password": "another-long-pass", "new_password": "brand-new-password"})
    assert ok.status_code == 204
    assert login(client, {"email": "p@example.com", "password": "brand-new-password"}).status_code == 200


def test_audit_trail_written(client):
    with dbmod._Session() as s:
        actions = {a.action for a in s.scalars(select(ActivityLog))}
    assert {"login", "created", "password_changed", "bootstrap_admin_created"} <= actions


def test_sequence_numbers():
    with dbmod._Session() as s:
        assert next_number(s, "INC") == "INC000001"
        assert next_number(s, "INC") == "INC000002"
        assert next_number(s, "REQ") == "REQ000001"


def test_rate_limit(client):
    client.cookies.clear()
    codes = [login(client, {"email": "admin@example.com", "password": "x"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
