from app.routers import auth as auth_router

ADMIN = {"email": "admin@example.com", "password": "correct-horse-battery"}
PARTNER = {"email": "p@example.com", "password": "brand-new-password"}


def login_as(client, creds):
    auth_router._attempts.clear()
    client.cookies.clear()
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r.json()["user"]


def ensure_partner(client):
    """Make a test file independent of ordering: the partner account exists, with a known password."""
    login_as(client, ADMIN)
    client.post("/api/users", json={"email": "p@example.com", "full_name": "Partner", "password": PARTNER["password"]})
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)
