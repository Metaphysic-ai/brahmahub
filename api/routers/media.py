"""Media file serving endpoint."""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..config import settings

router = APIRouter()


def make_media_url(filesystem_path: str | None) -> str | None:
    """Convert an absolute filesystem path to a /media/ URL.

    Tries each MEDIA_ROOT_PATHS prefix. Returns None if no match.
    """
    if not filesystem_path:
        return None

    for root in settings.media_root_paths:
        if filesystem_path.startswith(root):
            relative = filesystem_path[len(root):].lstrip(os.sep)
            return f"/media/{relative}"

    return None


@router.get("/{path:path}")
async def serve_media(path: str):
    """Serve a media file from disk.

    Only serves files under configured MEDIA_ROOT_PATHS.
    """
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")

    for root in settings.media_root_paths:
        full_path = Path(root) / path
        try:
            resolved = full_path.resolve()
            resolved_root = str(Path(root).resolve())
            if not str(resolved).startswith(resolved_root):
                continue
        except (OSError, ValueError):
            continue

        if resolved.is_file():
            content_type, _ = mimetypes.guess_type(str(resolved))
            headers = {}
            if content_type and content_type.startswith("image/"):
                headers["Cache-Control"] = "public, max-age=86400"
            return FileResponse(
                path=str(resolved),
                media_type=content_type or "application/octet-stream",
                headers=headers,
            )

    raise HTTPException(status_code=404, detail="File not found")
