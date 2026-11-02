from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_Session = None


def get_engine():
    global _engine, _Session
    if _engine is None:
        _engine = create_engine(get_settings().database_url, pool_pre_ping=True)
        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_db():
    get_engine()
    db = _Session()
    try:
        yield db
    finally:
        db.close()
