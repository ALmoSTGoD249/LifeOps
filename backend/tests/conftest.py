import os, tempfile
_tmp = tempfile.mkdtemp()
os.environ.update(UPLOAD_DIR=os.path.join(_tmp, "uploads"), DATABASE_URL=f"sqlite:///{_tmp}/test.db", SECRET_KEY="test", COOKIE_SECURE="false",
                  ADMIN_EMAIL="admin@example.com", ADMIN_PASSWORD="correct-horse-battery", ENVIRONMENT="test", SCHEDULER_ENABLED="false")
import pytest
from fastapi.testclient import TestClient
from app import db as dbmod
from app.main import create_app


@pytest.fixture(scope="session")
def client():
    app = create_app()
    from app.models import Base  # noqa
    from app.db import Base as B
    with TestClient(app) as c:  # lifespan creates engine; create tables before seed would run, so seed again
        yield c


@pytest.fixture(scope="session", autouse=True)
def _schema():
    from app.db import Base, get_engine
    import app.models  # noqa
    Base.metadata.create_all(get_engine())
    from app.bootstrap import seed
    with dbmod._Session() as s:
        seed(s)
