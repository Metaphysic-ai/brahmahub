"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import close_pool, get_conn, init_pool
from .routers import assets, ingest, media, packages, projects, search, stats, subjects

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    # Recover packages stuck in 'processing' from previous crashes/restarts
    try:
        async with get_conn() as conn:
            result = await conn.execute(
                "UPDATE packages SET status = 'error', "
                'metadata = metadata || \'{"error": "Server restarted during ingest"}\'::jsonb '
                "WHERE status = 'processing'"
            )
            if result != "UPDATE 0":
                logger.warning("Recovered stuck packages: %s", result)
    except Exception as e:
        logger.error("Failed to recover stuck packages: %s", e)
    yield
    await close_pool()


app = FastAPI(
    title="IngestHub API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(packages.router, prefix="/api/packages", tags=["packages"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(media.router, prefix="/media", tags=["media"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
