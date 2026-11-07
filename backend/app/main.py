import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app import db as dbmod
from app.bootstrap import seed
from app.config import get_settings
from app import models_assets, models_catalog, models_incidents, models_kb, models_maintenance, models_requests, models_tasks  # noqa: F401  (register tables)
from app.routers import assets, auth, catalog, incidents, knowledge, maintenance, requests, tasks, users


log = logging.getLogger("lifeops.scheduler")


def run_generation() -> int:
    from app.services.maintenance import generate_due_tasks
    with dbmod._Session() as session:
        made = generate_due_tasks(session)
        session.commit()
        return len(made)


async def _scheduler(minutes: int) -> None:
    while True:
        try:
            n = await asyncio.to_thread(run_generation)
            if n:
                log.info("generated %s maintenance task(s)", n)
        except Exception:  # never let the timer die
            log.exception("maintenance generation failed")
        await asyncio.sleep(minutes * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    dbmod.get_engine()
    with dbmod._Session() as session:
        seed(session)
    s = get_settings()
    task = asyncio.create_task(_scheduler(s.scheduler_interval_minutes)) if s.scheduler_enabled else None
    yield
    if task:
        task.cancel()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="LifeOps API", version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                           allow_methods=["*"], allow_headers=["*"])
    app.include_router(auth.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(incidents.router, prefix="/api")
    app.include_router(tasks.router, prefix="/api")
    app.include_router(catalog.router, prefix="/api")
    app.include_router(requests.router, prefix="/api")
    app.include_router(assets.router, prefix="/api")
    app.include_router(maintenance.router, prefix="/api")
    app.include_router(knowledge.router, prefix="/api")

    @app.get("/api/health", tags=["system"])
    def health():
        with dbmod.get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
