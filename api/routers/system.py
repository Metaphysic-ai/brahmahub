"""System info and automatic self-update."""

import asyncio
import contextlib
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path
from urllib.request import Request, urlopen

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import settings
from ..services.github_auth import get_github_headers, is_configured

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ReleaseAssetInfo(BaseModel):
    name: str
    size: int
    download_url: str


class LatestRelease(BaseModel):
    version: str
    tag_name: str
    published_at: str
    html_url: str
    assets: list[ReleaseAssetInfo]


class SystemInfo(BaseModel):
    version: str
    update_enabled: bool
    latest: LatestRelease | None = None
    update_available: bool = False


# ---------------------------------------------------------------------------
# GitHub Release cache (5 minutes)
# ---------------------------------------------------------------------------

_cached_release: LatestRelease | None = None
_cached_at: float = 0.0
CACHE_TTL = 300  # 5 minutes


def _get_version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("brahmahub")
    except PackageNotFoundError:
        return "0.0.0-dev"


def _fetch_latest_release() -> LatestRelease | None:
    """Fetch latest release from GitHub API, with 5-min cache."""
    global _cached_release, _cached_at

    if not settings.update_repo or not is_configured():
        return None

    now = time.monotonic()
    if _cached_release and (now - _cached_at) < CACHE_TTL:
        return _cached_release

    try:
        url = f"https://api.github.com/repos/{settings.update_repo}/releases/latest"
        req = Request(url, headers=get_github_headers())  # noqa: S310
        with urlopen(req, timeout=15) as resp:  # noqa: S310
            data = json.loads(resp.read())

        assets = []
        for a in data.get("assets", []):
            assets.append(
                ReleaseAssetInfo(
                    name=a["name"],
                    size=a["size"],
                    download_url=a["url"],
                )
            )

        tag_name = data.get("tag_name", "")
        version_str = tag_name.lstrip("v")
        release = LatestRelease(
            version=version_str,
            tag_name=tag_name,
            published_at=data.get("published_at", ""),
            html_url=data.get("html_url", ""),
            assets=assets,
        )
        _cached_release = release
        _cached_at = now
        return release
    except Exception:
        logger.exception("Failed to fetch latest release from GitHub")
        return _cached_release


def _compare_versions(current: str, latest: str) -> bool:
    """Return True if latest is newer than current."""

    def _parse(v: str) -> tuple[int, ...] | None:
        m = re.match(r"(\d+)\.(\d+)\.(\d+)", v.lstrip("v"))
        return tuple(int(x) for x in m.groups()) if m else None

    pc, pl = _parse(current), _parse(latest)
    if pc and pl:
        return pl > pc
    return False


def _run_cmd(args: list[str], *, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run a subprocess, returning the result."""
    try:
        return subprocess.run(args, capture_output=True, text=True, cwd=cwd, timeout=60)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Command timed out after 60s: {' '.join(args)}") from exc


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("/info", response_model=SystemInfo)
async def system_info():
    """Return current version and latest release info."""
    current = _get_version()
    update_enabled = bool(settings.update_repo) and is_configured()
    latest = None
    update_available = False

    if update_enabled:
        latest = await asyncio.to_thread(_fetch_latest_release)
        if latest:
            update_available = _compare_versions(current, latest.version)

    return SystemInfo(
        version=current,
        update_enabled=update_enabled,
        latest=latest,
        update_available=update_available,
    )


# ---------------------------------------------------------------------------
# Auto-update background task
# ---------------------------------------------------------------------------

_update_task: asyncio.Task[None] | None = None
_last_failed_tag: str = ""
_last_failed_at: float = 0.0
_RETRY_COOLDOWN = 3600  # Don't retry same version for 1 hour after failure


def start_auto_update(interval: int) -> None:
    """Start the auto-update background loop (called from lifespan)."""
    global _update_task
    _update_task = asyncio.create_task(_auto_update_loop(interval))


async def stop_auto_update() -> None:
    """Cancel the auto-update background loop (called from lifespan)."""
    global _update_task
    if _update_task:
        _update_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _update_task
        _update_task = None


async def _auto_update_loop(interval: int) -> None:
    """Background task: periodically check for new releases and auto-apply."""
    await asyncio.sleep(60)  # Initial delay — let server stabilize after startup
    while True:
        try:
            await _check_and_update()
        except Exception:
            logger.exception("Auto-update check failed")
        await asyncio.sleep(interval)


async def _check_and_update() -> None:
    """Single update check cycle. Fetches latest release, applies if newer."""
    global _last_failed_tag, _last_failed_at

    release = await asyncio.to_thread(_fetch_latest_release)
    if not release:
        return

    current = _get_version()
    if not _compare_versions(current, release.version):
        return

    # Don't retry a recently failed version
    now = time.monotonic()
    if release.tag_name == _last_failed_tag and (now - _last_failed_at) < _RETRY_COOLDOWN:
        return

    tag = release.tag_name
    logger.info("Auto-update: %s → %s", current, tag)

    # 1. git fetch the tag
    result = await asyncio.to_thread(_run_cmd, ["git", "fetch", "origin", "tag", tag, "--no-tags"])
    if result.returncode != 0:
        logger.error("Auto-update: git fetch failed: %s", result.stderr)
        _last_failed_tag, _last_failed_at = tag, time.monotonic()
        return

    # 2. git checkout the tag
    result = await asyncio.to_thread(_run_cmd, ["git", "checkout", tag])
    if result.returncode != 0:
        logger.error("Auto-update: git checkout failed: %s", result.stderr)
        _last_failed_tag, _last_failed_at = tag, time.monotonic()
        return

    # 3. Download pre-built frontend from release assets (non-fatal)
    try:
        await _download_frontend_dist(release)
    except Exception:
        logger.exception("Auto-update: frontend dist download failed (non-fatal)")

    # 4. Restart — systemd will bring us back with the new code
    logger.info("Auto-update: restarting to apply %s", tag)
    _restart()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _download_frontend_dist(release: LatestRelease) -> None:
    """Download frontend-dist.tar.gz from release and extract to frontend/dist/."""
    asset = next((a for a in release.assets if a.name == "frontend-dist.tar.gz"), None)
    if not asset:
        logger.warning("No frontend-dist.tar.gz in release assets, skipping frontend update")
        return

    def _download_and_extract():
        headers = get_github_headers(accept="application/octet-stream")
        req = Request(asset.download_url, headers=headers)  # noqa: S310

        dist_dir = Path("frontend/dist")
        new_dir = Path("frontend/dist.new")
        old_dir = Path("frontend/dist.old")

        # Clean up any leftover temp dirs
        if new_dir.exists():
            shutil.rmtree(new_dir)
        if old_dir.exists():
            shutil.rmtree(old_dir)

        with urlopen(req, timeout=120) as resp, tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:  # noqa: S310
            shutil.copyfileobj(resp, tmp)  # type: ignore[arg-type]
            tmp_path = Path(tmp.name)

        try:
            new_dir.mkdir(parents=True, exist_ok=True)
            with tarfile.open(tmp_path, "r:gz") as tar:
                tar.extractall(new_dir, filter="data")

            # Atomic swap with rollback
            if dist_dir.exists():
                dist_dir.rename(old_dir)
            try:
                new_dir.rename(dist_dir)
            except Exception:
                if old_dir.exists() and not dist_dir.exists():
                    old_dir.rename(dist_dir)
                raise
            if old_dir.exists():
                shutil.rmtree(old_dir)
        finally:
            tmp_path.unlink(missing_ok=True)

    await asyncio.to_thread(_download_and_extract)


def _restart() -> None:
    """Send SIGTERM to self, letting the process manager restart us."""
    logger.info("Restarting server...")
    os.kill(os.getpid(), signal.SIGTERM)
