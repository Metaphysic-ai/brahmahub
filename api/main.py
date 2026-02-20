"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.staticfiles import StaticFiles

from .config import settings
from .database import close_pool, get_conn, init_pool
from .routers import assets, ingest, media, packages, projects, search, stats, subjects, system

logger = logging.getLogger(__name__)

try:
    __version__ = version("brahmahub")
except PackageNotFoundError:
    __version__ = "0.0.0-dev"


async def _run_migrations() -> None:
    """Apply any unapplied SQL migrations from db/migrations/."""
    migrations_dir = Path("db/migrations")
    if not migrations_dir.exists():
        return

    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        return

    async with get_conn() as conn:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
        )

        for sql_file in sql_files:
            filename = sql_file.name
            already = await conn.fetchval("SELECT 1 FROM _migrations WHERE filename = $1", filename)
            if already:
                continue

            logger.info("Applying migration: %s", filename)
            sql = sql_file.read_text()
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("INSERT INTO _migrations (filename) VALUES ($1)", filename)
            logger.info("Migration applied: %s", filename)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    await _run_migrations()
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
    # Self-update: warn about misconfiguration or start auto-update loop
    if settings.update_repo:
        from .services.github_auth import is_configured

        if not is_configured():
            logger.warning(
                "UPDATE_REPO is set but GitHub App credentials are missing (GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, GITHUB_INSTALLATION_ID) — self-update disabled"
            )
        elif not Path(settings.github_private_key_path).exists():
            logger.warning(
                "GitHub App private key not found at %s — self-update will fail", settings.github_private_key_path
            )
        elif settings.auto_update_interval > 0:
            from .routers.system import start_auto_update

            start_auto_update(settings.auto_update_interval)
            logger.info("Auto-update enabled (interval: %ds)", settings.auto_update_interval)
    yield
    if settings.update_repo:
        from .services.github_auth import is_configured

        if is_configured() and settings.auto_update_interval > 0:
            from .routers.system import stop_auto_update

            await stop_auto_update()
    await close_pool()


app = FastAPI(
    title="BrahmaHub API",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,  # type: ignore[arg-type]
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
app.include_router(system.router, prefix="/api/system", tags=["system"])


@app.get("/api/health")
async def health():
    return JSONResponse(
        {"status": "ok", "version": __version__},
        headers={"Cache-Control": "no-store"},
    )


class SPAStaticFiles(StaticFiles):
    """Serve SPA with cache-aware headers.

    - index.html: no-cache (always revalidate so deploys take effect)
    - Hashed assets (js/css): immutable (Vite content-hashes filenames)
    - Unknown paths: return index.html for SPA client-side routing
    """

    async def get_response(self, path, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            response = FileResponse(Path(self.directory or "") / "index.html")

        return self._set_cache_headers(path, response)

    @staticmethod
    def _set_cache_headers(path: str, response: Response) -> Response:
        if path == "." or path == "index.html" or path == "":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        elif "/assets/" in path:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response


# Serve frontend in production (when frontend/dist/ exists)
_dist_dir = Path("frontend/dist")
if _dist_dir.exists():
    app.mount("/", SPAStaticFiles(directory=str(_dist_dir), html=True), name="spa")
