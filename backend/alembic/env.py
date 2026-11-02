from alembic import context
from sqlalchemy import create_engine
from app.config import get_settings
from app.db import Base
import app.models  # noqa: F401  (register tables)

target_metadata = Base.metadata


def run() -> None:
    engine = create_engine(get_settings().database_url)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True,
                          render_as_batch=conn.dialect.name == "sqlite")
        with context.begin_transaction():
            context.run_migrations()


run()
