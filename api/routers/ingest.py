"""Ingest endpoints — analyze and execute package ingestion."""

import asyncio
import json as _json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from cli.ingesthub_cli.media import (
    generate_image_thumbnail,
    generate_video_proxy,
    generate_video_thumbnail,
    get_mime_type,
    probe_audio,
    probe_image,
    probe_video,
)

from ..config import settings
from ..database import get_conn
from ..models import (
    AnalysisResult,
    IngestAnalyzeRequest,
    IngestExecuteRequest,
    IngestExecuteResult,
)
from ..services.analyzer import analyze_path, classify_file
from ..services.datasets import (
    create_dataset_symlinks,
    fuzzy_match_dataset,
    list_dataset_dirs,
)
from ..services.metadata import read_face_metadata
from .media import make_media_url
from .subjects import normalize_subject_name

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_PROXY_DIR = Path(settings.proxy_dir)

INGEST_WORKERS = 4


def _generate_video_media(filepath: Path, proxy_dir: Path, probe: dict, proxy_height: int):
    """Generate video proxy + thumbnail. Runs in thread pool."""
    needs_proxy = probe.get("needs_proxy", True)
    w = probe.get("width") or 0
    h = probe.get("height") or 0
    is_high_res = w >= 1920 and h >= 1080

    if needs_proxy or is_high_res:
        proxy_path = generate_video_proxy(filepath, proxy_dir, max_height=proxy_height)
    else:
        proxy_path = filepath
    thumb_path = generate_video_thumbnail(filepath, proxy_dir)
    return proxy_path, thumb_path


def _generate_image_media(filepath: Path, proxy_dir: Path):
    """Generate image thumbnail. Runs in thread pool."""
    thumb_path = generate_image_thumbnail(filepath, proxy_dir)
    return filepath, thumb_path


def _generate_video_thumbnail_only(filepath: Path, proxy_dir: Path):
    """Generate only thumbnail (no proxy). Runs in thread pool."""
    thumb_path = generate_video_thumbnail(filepath, proxy_dir)
    return None, thumb_path


def _generate_image_thumbnail_only(filepath: Path, proxy_dir: Path):
    """Generate only thumbnail (no proxy). Runs in thread pool."""
    thumb_path = generate_image_thumbnail(filepath, proxy_dir)
    return None, thumb_path


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_package(data: IngestAnalyzeRequest):
    """Analyze a directory for package ingestion."""
    source = Path(data.source_path)
    if not source.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {data.source_path}")
    if not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {data.source_path}")

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, analyze_path, data.source_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Analysis failed for %s: %s", data.source_path, e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e

    return result


@router.get("/dataset-dirs")
async def get_dataset_dirs():
    """List available dataset directories."""
    root = settings.datasets_root
    if not root:
        return {"datasets_root": "", "dirs": []}
    dirs = await asyncio.get_event_loop().run_in_executor(None, list_dataset_dirs, root)
    return {"datasets_root": root, "dirs": dirs}


class _ResolveSubject(BaseModel):
    name: str


class _ResolveDatasetsRequest(BaseModel):
    subjects: list[_ResolveSubject]


@router.post("/resolve-datasets")
async def resolve_datasets(data: _ResolveDatasetsRequest):
    """Fuzzy-match subject names to dataset directories."""
    root = settings.datasets_root
    dirs = list_dataset_dirs(root) if root else []

    mappings = []
    for subj in data.subjects:
        existing_dir = None
        # Check if subject already has a dataset_dir in DB
        async with get_conn() as conn:
            row = await conn.fetchrow(
                "SELECT dataset_dir FROM subjects WHERE name = $1 AND dataset_dir IS NOT NULL LIMIT 1",
                normalize_subject_name(subj.name),
            )
            if row:
                existing_dir = row["dataset_dir"]

        suggestions = fuzzy_match_dataset(subj.name, dirs) if dirs else []
        mappings.append(
            {
                "subject_name": subj.name,
                "existing_dir": existing_dir,
                "suggestions": suggestions,
            }
        )

    return {"mappings": mappings}


@router.post("/execute", response_model=IngestExecuteResult)
async def execute_ingest(data: IngestExecuteRequest):
    """Execute package ingestion based on a (possibly modified) analysis result."""
    source = Path(data.source_path)
    if not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Source path not found: {data.source_path}")

    selected_files = []
    for subj in data.subjects:
        for f in subj.files:
            if f.selected:
                selected_files.append((subj.name, f))

    if not selected_files:
        raise HTTPException(status_code=400, detail="No files selected for ingestion")

    proxy_base = DEFAULT_PROXY_DIR / data.package_name
    is_vfx = data.package_type == "vfx"

    try:
        async with get_conn() as conn:
            async with conn.transaction():
                row = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", data.project_id)
                if not row:
                    raise HTTPException(status_code=404, detail="Project not found")

            subjects_created = []
            subject_ids = {}
            for subj in data.subjects:
                has_selected = any(f.selected for f in subj.files)
                if not has_selected:
                    continue

                normalized_name = normalize_subject_name(subj.name)
                row = await conn.fetchrow(
                    "SELECT id FROM subjects WHERE project_id = $1 AND name = $2",
                    data.project_id,
                    normalized_name,
                )
                if row:
                    subject_ids[normalized_name] = row["id"]
                else:
                    sid = uuid.uuid4()
                    await conn.execute(
                        "INSERT INTO subjects (id, project_id, name) VALUES ($1, $2, $3)",
                        sid,
                        data.project_id,
                        normalized_name,
                    )
                    subject_ids[normalized_name] = sid
                    subjects_created.append(normalized_name)

            norm_selected_files = []
            for subj in data.subjects:
                normalized_name = normalize_subject_name(subj.name)
                for f in subj.files:
                    if f.selected:
                        norm_selected_files.append((normalized_name, f))
            selected_files = norm_selected_files

            multi_subject = len(subject_ids) > 1
            package_ids = {}
            package_stats = {}

            if is_vfx:
                for subj_name, subj_sid in subject_ids.items():
                    pkg_name = f"{data.package_name} \u2014 {subj_name}" if multi_subject else data.package_name
                    pkg_id = uuid.uuid4()
                    await conn.execute(
                        """INSERT INTO packages (id, subject_id, name, disk_path, source_description, tags, metadata, status, package_type)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)""",
                        pkg_id,
                        subj_sid,
                        pkg_name,
                        str(source),
                        data.description,
                        data.tags,
                        {"package_type": data.package_type},
                        data.package_type,
                    )
                    await conn.execute(
                        "INSERT INTO packages_subjects (package_id, subject_id) VALUES ($1, $2)",
                        pkg_id,
                        subj_sid,
                    )
                    package_ids[subj_name] = pkg_id
                    package_stats[subj_name] = {"count": 0, "size": 0}
            else:
                pkg_id = uuid.uuid4()
                first_subject = next(iter(subject_ids.values()))
                await conn.execute(
                    """INSERT INTO packages (id, subject_id, name, disk_path, source_description, tags, metadata, status, package_type)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)""",
                    pkg_id,
                    first_subject,
                    data.package_name,
                    str(source),
                    data.description,
                    data.tags,
                    {"package_type": data.package_type},
                    data.package_type,
                )
                for subj_name, subj_sid in subject_ids.items():
                    await conn.execute(
                        "INSERT INTO packages_subjects (package_id, subject_id) VALUES ($1, $2)",
                        pkg_id,
                        subj_sid,
                    )
                    package_ids[subj_name] = pkg_id
                    package_stats[subj_name] = {"count": 0, "size": 0}

            asset_count = 0
            first_thumb_by_subject = {}
            pending = []

            executor = ThreadPoolExecutor(max_workers=INGEST_WORKERS)
            try:
                for subject_name, file_input in selected_files:
                    filepath = source / file_input.original_path
                    if not filepath.exists():
                        logger.warning("File not found, skipping: %s", filepath)
                        continue

                    rel_path = file_input.original_path
                    ftype = classify_file(filepath)
                    if ftype not in ("video", "image", "audio"):
                        ftype = "other"

                    file_size = filepath.stat().st_size

                    if ftype == "video":
                        probe = probe_video(filepath)
                    elif ftype == "audio":
                        probe = probe_audio(filepath)
                    else:
                        probe = probe_image(filepath)

                    face_meta = {}
                    if is_vfx and filepath.suffix.lower() == ".png":
                        face_meta = read_face_metadata(filepath)

                    asset_metadata = probe.get("metadata", {})
                    if face_meta:
                        asset_metadata["face"] = face_meta

                    future = None
                    asset_proxy_dir = proxy_base / Path(rel_path).parent
                    if not data.skip_proxies:
                        if ftype == "video":
                            future = executor.submit(
                                _generate_video_media, filepath, asset_proxy_dir, probe, data.proxy_height
                            )
                        elif ftype == "image":
                            future = executor.submit(_generate_image_media, filepath, asset_proxy_dir)
                    else:
                        if ftype == "video":
                            future = executor.submit(_generate_video_thumbnail_only, filepath, asset_proxy_dir)
                        elif ftype == "image":
                            future = executor.submit(_generate_image_thumbnail_only, filepath, asset_proxy_dir)

                    pending.append(
                        {
                            "subject_name": subject_name,
                            "file_input": file_input,
                            "filepath": filepath,
                            "rel_path": rel_path,
                            "ftype": ftype,
                            "file_size": file_size,
                            "probe": probe,
                            "asset_metadata": asset_metadata,
                            "future": future,
                        }
                    )

                insert_rows = []
                for info in pending:
                    proxy_path = None
                    thumb_path = None
                    if info["future"]:
                        try:
                            proxy_path, thumb_path = await asyncio.wait_for(
                                asyncio.wrap_future(info["future"]), timeout=300
                            )
                        except Exception as e:
                            logger.warning(
                                "Media gen failed/timed out for %s: %s", Path(info["file_input"].original_path).name, e
                            )

                    subject_name = info["subject_name"]
                    if thumb_path and subject_name not in first_thumb_by_subject:
                        first_thumb_by_subject[subject_name] = thumb_path

                    insert_rows.append(
                        (
                            uuid.uuid4(),
                            package_ids[subject_name],
                            subject_ids[subject_name],
                            info["rel_path"],
                            info["ftype"],
                            get_mime_type(info["filepath"]),
                            info["file_size"],
                            str(info["filepath"]),
                            str(proxy_path) if proxy_path else None,
                            str(thumb_path) if thumb_path else None,
                            info["probe"].get("width"),
                            info["probe"].get("height"),
                            info["probe"].get("duration_seconds"),
                            info["probe"].get("codec"),
                            info["probe"].get("camera"),
                            [subject_name, info["file_input"].asset_type],
                            info["asset_metadata"],
                            info["file_input"].asset_type,
                        )
                    )
                    asset_count += 1
                    package_stats[subject_name]["count"] += 1
                    package_stats[subject_name]["size"] += info["file_size"]

                if insert_rows:
                    await conn.executemany(
                        """INSERT INTO assets (
                            id, package_id, subject_id, filename, file_type, mime_type,
                            file_size_bytes, disk_path, proxy_path, thumbnail_path,
                            width, height, duration_seconds, codec, camera,
                            tags, metadata, asset_type
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6,
                            $7, $8, $9, $10,
                            $11, $12, $13, $14, $15,
                            $16, $17, $18
                        )""",
                        insert_rows,
                    )
            finally:
                executor.shutdown(wait=True)

            if is_vfx:
                for pkg_id in package_ids.values():
                    face_agg = await conn.fetchrow(
                        """
                        SELECT
                            jsonb_agg(DISTINCT metadata->'face'->>'face_type')
                                FILTER (WHERE metadata->'face'->>'face_type' IS NOT NULL) AS face_types,
                            COUNT(*) FILTER (WHERE asset_type = 'aligned') AS aligned_count,
                            MAX((metadata->'face'->>'source_width')::int)
                                FILTER (WHERE metadata->'face'->>'source_width' IS NOT NULL) AS source_width,
                            MAX((metadata->'face'->>'source_height')::int)
                                FILTER (WHERE metadata->'face'->>'source_height' IS NOT NULL) AS source_height
                        FROM assets WHERE package_id = $1
                    """,
                        pkg_id,
                    )
                    if face_agg:
                        merge = {}
                        if face_agg["face_types"]:
                            ft = face_agg["face_types"]
                            merge["face_types"] = _json.loads(ft) if isinstance(ft, str) else ft
                        merge["aligned_count"] = face_agg["aligned_count"]
                        if face_agg["source_width"]:
                            merge["source_width"] = face_agg["source_width"]
                        if face_agg["source_height"]:
                            merge["source_height"] = face_agg["source_height"]
                        await conn.execute(
                            "UPDATE packages SET metadata = metadata || $1::text::jsonb WHERE id = $2",
                            _json.dumps(merge),
                            pkg_id,
                        )

            if is_vfx:
                for pkg_id in package_ids.values():
                    vfx_meta = {}
                    src = await conn.fetchrow(
                        """
                        SELECT metadata->'face'->>'source_filepath' AS path,
                               metadata->'face'->>'source_filename' AS name
                        FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
                          AND metadata->'face'->>'source_filepath' IS NOT NULL LIMIT 1
                    """,
                        pkg_id,
                    )
                    if src and src["path"]:
                        vfx_meta["source_video_path"] = src["path"]
                        vfx_meta["source_video_filename"] = src["name"]
                    grid = await conn.fetchrow(
                        "SELECT id FROM assets WHERE package_id = $1 AND asset_type = 'grid' LIMIT 1", pkg_id
                    )
                    if grid:
                        vfx_meta["grid_asset_id"] = str(grid["id"])
                    plate = await conn.fetchrow(
                        "SELECT id, disk_path FROM assets WHERE package_id = $1 AND asset_type = 'plate' LIMIT 1",
                        pkg_id,
                    )
                    if plate:
                        vfx_meta["plate_asset_id"] = str(plate["id"])
                        if "source_video_path" not in vfx_meta:
                            vfx_meta["source_video_path"] = plate["disk_path"]
                    if vfx_meta:
                        await conn.execute(
                            "UPDATE packages SET metadata = metadata || $1::text::jsonb WHERE id = $2",
                            _json.dumps(vfx_meta),
                            pkg_id,
                        )

            if is_vfx:
                for pkg_id in package_ids.values():
                    pose_rows = await conn.fetch(
                        """
                        SELECT (FLOOR((metadata->'face'->>'yaw')::float / 10) * 10)::int AS y,
                               (FLOOR((metadata->'face'->>'pitch')::float / 10) * 10)::int AS p,
                               COUNT(*) AS count
                        FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
                          AND metadata->'face'->>'yaw' IS NOT NULL
                        GROUP BY 1, 2
                    """,
                        pkg_id,
                    )
                    if pose_rows:
                        pose_data = [{"y": r["y"], "p": r["p"], "count": r["count"]} for r in pose_rows]
                        await conn.execute(
                            "UPDATE packages SET metadata = metadata || $1::text::jsonb WHERE id = $2",
                            _json.dumps({"pose_data": pose_data}),
                            pkg_id,
                        )

            pkg_totals: dict = {}
            for subj_name, pkg_id in package_ids.items():
                s = package_stats[subj_name]
                if pkg_id not in pkg_totals:
                    pkg_totals[pkg_id] = {"count": 0, "size": 0}
                pkg_totals[pkg_id]["count"] += s["count"]
                pkg_totals[pkg_id]["size"] += s["size"]

            for pkg_id, s in pkg_totals.items():
                await conn.execute(
                    "UPDATE packages SET file_count = $1, total_size_bytes = $2, status = 'ready' WHERE id = $3",
                    s["count"],
                    s["size"],
                    pkg_id,
                )

            for subject_name, thumb in first_thumb_by_subject.items():
                sid = subject_ids.get(subject_name)
                if sid:
                    thumb_url = make_media_url(str(thumb)) or str(thumb)
                    await conn.execute(
                        "UPDATE subjects SET thumbnail_url = $1 WHERE id = $2 AND thumbnail_url IS NULL",
                        thumb_url,
                        sid,
                    )

            # --- Dataset symlinks (best-effort) ---
            if data.dataset_mappings:
                assets_by_subject: dict[str, list[dict]] = {}
                for info in pending:
                    sn = info["subject_name"]
                    assets_by_subject.setdefault(sn, []).append(
                        {
                            "original_path": str(info["filepath"]),
                            "file_type": info["ftype"],
                            "asset_type": info["file_input"].asset_type,
                        }
                    )

                for dm in data.dataset_mappings:
                    norm_name = normalize_subject_name(dm.subject_name)
                    ds_dir = dm.dataset_dir
                    subj_assets = assets_by_subject.get(norm_name, [])
                    if not subj_assets:
                        continue
                    if dm.is_new:
                        try:
                            Path(ds_dir).mkdir(parents=True, exist_ok=True)
                        except Exception as e:
                            logger.warning("Failed to create dataset dir %s: %s", ds_dir, e)
                    try:
                        create_dataset_symlinks(ds_dir, data.package_name, subj_assets)
                    except Exception as e:
                        logger.warning("Dataset symlink failed for %s: %s", norm_name, e)

                    sid = subject_ids.get(norm_name)
                    if sid:
                        await conn.execute(
                            "UPDATE subjects SET dataset_dir = $1 WHERE id = $2",
                            ds_dir,
                            sid,
                        )

        first_package_id = next(iter(package_ids.values()))
        logger.info(
            "Ingest complete: packages=%d, assets=%d, subjects=%s",
            len(package_ids),
            asset_count,
            subjects_created,
        )

        return IngestExecuteResult(
            package_id=first_package_id,
            file_count=asset_count,
            subjects_created=subjects_created,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Ingest failed for %s: %s", data.package_name, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingest failed: {e}") from e


@router.post("/execute-stream")
async def execute_ingest_stream(data: IngestExecuteRequest):
    """SSE streaming variant of execute_ingest."""
    source = Path(data.source_path)
    if not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Source path not found: {data.source_path}")

    _valid_files = [f for subj in data.subjects for f in subj.files if f.selected]
    if not _valid_files:
        raise HTTPException(status_code=400, detail="No files selected for ingestion")

    async def event_generator():
        start_time = time.time()
        proxy_base = DEFAULT_PROXY_DIR / data.package_name
        is_vfx = data.package_type == "vfx"

        def send(payload: dict) -> str:
            payload["elapsed"] = round(time.time() - start_time, 1)
            return f"data: {_json.dumps(payload)}\n\n"

        try:
            async with get_conn() as conn:
                async with conn.transaction():
                    row = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", data.project_id)
                    if not row:
                        yield send({"type": "error", "message": "Project not found"})
                        return

                    subjects_created = []
                    subject_ids = {}
                    for subj in data.subjects:
                        has_selected = any(f.selected for f in subj.files)
                        if not has_selected:
                            continue
                        normalized_name = normalize_subject_name(subj.name)
                        row = await conn.fetchrow(
                            "SELECT id FROM subjects WHERE project_id = $1 AND name = $2",
                            data.project_id,
                            normalized_name,
                        )
                        if row:
                            subject_ids[normalized_name] = row["id"]
                        else:
                            sid = uuid.uuid4()
                            await conn.execute(
                                "INSERT INTO subjects (id, project_id, name) VALUES ($1, $2, $3)",
                                sid,
                                data.project_id,
                                normalized_name,
                            )
                            subject_ids[normalized_name] = sid
                            subjects_created.append(normalized_name)

                    norm_selected_files = []
                    for subj in data.subjects:
                        n_name = normalize_subject_name(subj.name)
                        for f in subj.files:
                            if f.selected:
                                norm_selected_files.append((n_name, f))
                    selected_files = norm_selected_files
                    total = len(selected_files)

                    multi_subject = len(subject_ids) > 1
                    package_ids = {}
                    package_stats = {}

                    if is_vfx:
                        for subj_name, subj_sid in subject_ids.items():
                            pkg_name = f"{data.package_name} \u2014 {subj_name}" if multi_subject else data.package_name
                            pkg_id = uuid.uuid4()
                            await conn.execute(
                                """INSERT INTO packages (id, subject_id, name, disk_path, source_description, tags, metadata, status, package_type)
                                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)""",
                                pkg_id,
                                subj_sid,
                                pkg_name,
                                str(source),
                                data.description,
                                data.tags,
                                {"package_type": data.package_type},
                                data.package_type,
                            )
                            await conn.execute(
                                "INSERT INTO packages_subjects (package_id, subject_id) VALUES ($1, $2)",
                                pkg_id,
                                subj_sid,
                            )
                            package_ids[subj_name] = pkg_id
                            package_stats[subj_name] = {"count": 0, "size": 0}
                    else:
                        pkg_id = uuid.uuid4()
                        first_subject = next(iter(subject_ids.values()))
                        await conn.execute(
                            """INSERT INTO packages (id, subject_id, name, disk_path, source_description, tags, metadata, status, package_type)
                               Values ($1, $2, $3, $4, $5, $6, $7, 'processing', $8)""",
                            pkg_id,
                            first_subject,
                            data.package_name,
                            str(source),
                            data.description,
                            data.tags,
                            {"package_type": data.package_type},
                            data.package_type,
                        )
                        for subj_name, subj_sid in subject_ids.items():
                            await conn.execute(
                                "INSERT INTO packages_subjects (package_id, subject_id) VALUES ($1, $2)",
                                pkg_id,
                                subj_sid,
                            )
                            package_ids[subj_name] = pkg_id
                            package_stats[subj_name] = {"count": 0, "size": 0}

                    yield send(
                        {
                            "type": "setup",
                            "subjects": len(subject_ids),
                            "packages": len(package_ids),
                            "total_files": total,
                        }
                    )

                    asset_count = 0
                    first_thumb_by_subject = {}
                    pending = []

                    executor = ThreadPoolExecutor(max_workers=INGEST_WORKERS)
                    try:
                        for idx, (subject_name, file_input) in enumerate(selected_files):
                            filepath = source / file_input.original_path
                            filename = Path(file_input.original_path).name

                            if not filepath.exists():
                                yield send(
                                    {
                                        "current": idx + 1,
                                        "total": total,
                                        "file": filename,
                                        "step": "skipped",
                                        "message": "File not found",
                                    }
                                )
                                continue

                            yield send({"current": idx + 1, "total": total, "file": filename, "step": "probing"})

                            rel_path = file_input.original_path
                            ftype = classify_file(filepath)
                            if ftype not in ("video", "image", "audio"):
                                ftype = "other"

                            file_size = filepath.stat().st_size

                            if ftype == "video":
                                probe = probe_video(filepath)
                            elif ftype == "audio":
                                probe = probe_audio(filepath)
                            else:
                                probe = probe_image(filepath)

                            face_meta = {}
                            if is_vfx and filepath.suffix.lower() == ".png":
                                face_meta = read_face_metadata(filepath)

                            asset_metadata = probe.get("metadata", {})
                            if face_meta:
                                asset_metadata["face"] = face_meta

                            future = None
                            asset_proxy_dir = proxy_base / Path(rel_path).parent
                            if not data.skip_proxies:
                                if ftype == "video":
                                    future = executor.submit(
                                        _generate_video_media, filepath, asset_proxy_dir, probe, data.proxy_height
                                    )
                                elif ftype == "image":
                                    future = executor.submit(_generate_image_media, filepath, asset_proxy_dir)
                            else:
                                if ftype == "video":
                                    future = executor.submit(_generate_video_thumbnail_only, filepath, asset_proxy_dir)
                                elif ftype == "image":
                                    future = executor.submit(_generate_image_thumbnail_only, filepath, asset_proxy_dir)

                            pending.append(
                                {
                                    "idx": idx,
                                    "subject_name": subject_name,
                                    "file_input": file_input,
                                    "filepath": filepath,
                                    "filename": filename,
                                    "rel_path": rel_path,
                                    "ftype": ftype,
                                    "file_size": file_size,
                                    "probe": probe,
                                    "asset_metadata": asset_metadata,
                                    "future": future,
                                }
                            )

                        for info in pending:
                            yield send(
                                {
                                    "current": info["idx"] + 1,
                                    "total": total,
                                    "file": info["filename"],
                                    "step": "inserting",
                                }
                            )

                            proxy_path = None
                            thumb_path = None
                            if info["future"]:
                                try:
                                    proxy_path, thumb_path = await asyncio.wait_for(
                                        asyncio.wrap_future(info["future"]), timeout=300
                                    )
                                except Exception as e:
                                    logger.warning("Media gen failed/timed out for %s: %s", info["filename"], e)

                            subject_name = info["subject_name"]
                            if thumb_path and subject_name not in first_thumb_by_subject:
                                first_thumb_by_subject[subject_name] = thumb_path

                            asset_id = uuid.uuid4()
                            await conn.execute(
                                """INSERT INTO assets (
                                    id, package_id, subject_id, filename, file_type, mime_type,
                                    file_size_bytes, disk_path, proxy_path, thumbnail_path,
                                    width, height, duration_seconds, codec, camera,
                                    tags, metadata, asset_type
                                ) VALUES (
                                    $1, $2, $3, $4, $5, $6,
                                    $7, $8, $9, $10,
                                    $11, $12, $13, $14, $15,
                                    $16, $17, $18
                                )""",
                                asset_id,
                                package_ids[subject_name],
                                subject_ids[subject_name],
                                info["rel_path"],
                                info["ftype"],
                                get_mime_type(info["filepath"]),
                                info["file_size"],
                                str(info["filepath"]),
                                str(proxy_path) if proxy_path else None,
                                str(thumb_path) if thumb_path else None,
                                info["probe"].get("width"),
                                info["probe"].get("height"),
                                info["probe"].get("duration_seconds"),
                                info["probe"].get("codec"),
                                info["probe"].get("camera"),
                                [subject_name, info["file_input"].asset_type],
                                info["asset_metadata"],
                                info["file_input"].asset_type,
                            )
                            asset_count += 1
                            package_stats[subject_name]["count"] += 1
                            package_stats[subject_name]["size"] += info["file_size"]
                    finally:
                        executor.shutdown(wait=True)

                    yield send(
                        {
                            "type": "finalizing",
                            "message": "Updating package stats and committing...",
                            "total_files": asset_count,
                        }
                    )

                    if is_vfx:
                        for pkg_id in package_ids.values():
                            face_agg = await conn.fetchrow(
                                """
                                SELECT
                                    jsonb_agg(DISTINCT metadata->'face'->>'face_type')
                                        FILTER (WHERE metadata->'face'->>'face_type' IS NOT NULL) AS face_types,
                                    COUNT(*) FILTER (WHERE asset_type = 'aligned') AS aligned_count,
                                    MAX((metadata->'face'->>'source_width')::int)
                                        FILTER (WHERE metadata->'face'->>'source_width' IS NOT NULL) AS source_width,
                                    MAX((metadata->'face'->>'source_height')::int)
                                        FILTER (WHERE metadata->'face'->>'source_height' IS NOT NULL) AS source_height
                                FROM assets WHERE package_id = $1
                            """,
                                pkg_id,
                            )
                            if face_agg:
                                merge = {}
                                if face_agg["face_types"]:
                                    ft = face_agg["face_types"]
                                    merge["face_types"] = _json.loads(ft) if isinstance(ft, str) else ft
                                merge["aligned_count"] = face_agg["aligned_count"]
                                if face_agg["source_width"]:
                                    merge["source_width"] = face_agg["source_width"]
                                if face_agg["source_height"]:
                                    merge["source_height"] = face_agg["source_height"]
                                await conn.execute(
                                    "UPDATE packages SET metadata = metadata || $1::text::jsonb WHERE id = $2",
                                    _json.dumps(merge),
                                    pkg_id,
                                )

                    if is_vfx:
                        for pkg_id in package_ids.values():
                            vfx_meta = {}
                            src = await conn.fetchrow(
                                """
                                SELECT metadata->'face'->>'source_filepath' AS path,
                                       metadata->'face'->>'source_filename' AS name
                                FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
                                  AND metadata->'face'->>'source_filepath' IS NOT NULL LIMIT 1
                            """,
                                pkg_id,
                            )
                            if src and src["path"]:
                                vfx_meta["source_video_path"] = src["path"]
                                vfx_meta["source_video_filename"] = src["name"]
                            grid = await conn.fetchrow(
                                "SELECT id FROM assets WHERE package_id = $1 AND asset_type = 'grid' LIMIT 1", pkg_id
                            )
                            if grid:
                                vfx_meta["grid_asset_id"] = str(grid["id"])
                            plate = await conn.fetchrow(
                                "SELECT id, disk_path FROM assets WHERE package_id = $1 AND asset_type = 'plate' LIMIT 1",
                                pkg_id,
                            )
                            if plate:
                                vfx_meta["plate_asset_id"] = str(plate["id"])
                                if "source_video_path" not in vfx_meta:
                                    vfx_meta["source_video_path"] = plate["disk_path"]
                            if vfx_meta:
                                await conn.execute(
                                    "UPDATE packages SET metadata = metadata || $1::text::jsonb WHERE id = $2",
                                    _json.dumps(vfx_meta),
                                    pkg_id,
                                )

                    pkg_totals: dict = {}
                    for subj_name, pkg_id in package_ids.items():
                        s = package_stats[subj_name]
                        if pkg_id not in pkg_totals:
                            pkg_totals[pkg_id] = {"count": 0, "size": 0}
                        pkg_totals[pkg_id]["count"] += s["count"]
                        pkg_totals[pkg_id]["size"] += s["size"]

                    for pkg_id, s in pkg_totals.items():
                        await conn.execute(
                            "UPDATE packages SET file_count = $1, total_size_bytes = $2, status = 'ready' WHERE id = $3",
                            s["count"],
                            s["size"],
                            pkg_id,
                        )

                    for subject_name, thumb in first_thumb_by_subject.items():
                        sid = subject_ids.get(subject_name)
                        if sid:
                            thumb_url = make_media_url(str(thumb)) or str(thumb)
                            await conn.execute(
                                "UPDATE subjects SET thumbnail_url = $1 WHERE id = $2 AND thumbnail_url IS NULL",
                                thumb_url,
                                sid,
                            )

                    # --- Dataset symlinks (best-effort) ---
                    if data.dataset_mappings:
                        # Build per-subject asset lists from pending info
                        assets_by_subject: dict[str, list[dict]] = {}
                        for info in pending:
                            sn = info["subject_name"]
                            assets_by_subject.setdefault(sn, []).append(
                                {
                                    "original_path": str(info["filepath"]),
                                    "file_type": info["ftype"],
                                    "asset_type": info["file_input"].asset_type,
                                }
                            )

                        for dm in data.dataset_mappings:
                            norm_name = normalize_subject_name(dm.subject_name)
                            ds_dir = dm.dataset_dir
                            subj_assets = assets_by_subject.get(norm_name, [])
                            if not subj_assets:
                                continue

                            # Create new dataset dir if needed
                            if dm.is_new:
                                try:
                                    Path(ds_dir).mkdir(parents=True, exist_ok=True)
                                except Exception as e:
                                    logger.warning("Failed to create dataset dir %s: %s", ds_dir, e)

                            try:
                                result = await asyncio.get_event_loop().run_in_executor(
                                    None,
                                    create_dataset_symlinks,
                                    ds_dir,
                                    data.package_name,
                                    subj_assets,
                                )
                                yield send(
                                    {
                                        "type": "datasets",
                                        "subject": norm_name,
                                        "created": result["created"],
                                        "skipped": result["skipped"],
                                        "errors": len(result["errors"]),
                                    }
                                )
                            except Exception as e:
                                logger.warning("Dataset symlink failed for %s: %s", norm_name, e)

                            # Persist dataset_dir on subject
                            sid = subject_ids.get(norm_name)
                            if sid:
                                await conn.execute(
                                    "UPDATE subjects SET dataset_dir = $1 WHERE id = $2",
                                    ds_dir,
                                    sid,
                                )

                first_pkg_id = next(iter(package_ids.values()))
                yield send(
                    {
                        "type": "complete",
                        "package_id": str(first_pkg_id),
                        "file_count": asset_count,
                        "subjects_created": subjects_created,
                    }
                )

        except Exception as e:
            logger.error("Streaming ingest failed: %s", e)
            yield send({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
