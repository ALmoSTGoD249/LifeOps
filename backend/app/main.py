from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app import db as dbmod
from app.bootstrap import seed
from app.config import get_settings
from app.routers import auth, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    dbmod.get_engine()
    with dbmod._Session() as session:
        seed(session)
    yield


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

    @app.get("/api/health", tags=["system"])
    def health():
        with dbmod.get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
