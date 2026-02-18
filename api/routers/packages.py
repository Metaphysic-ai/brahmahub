"""Package endpoints."""

import json as _json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..database import get_conn, build_update
from ..models import BulkDeleteRequest, PackageCreate, PackageResponse, PackageSummary, PackageUpdate, PaginatedAssetResponse, PaginatedPackageResponse
from ..services.metadata import read_face_metadata
from .assets import _build_asset_filters, _paginated_asset_query

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=PaginatedPackageResponse)
async def list_packages(
    subject_id: Optional[UUID] = Query(None),
    package_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    async with get_conn() as conn:
        conditions: list[str] = []
        params: list = []
        idx = 1
        joins = ""

        if subject_id:
            joins = "JOIN packages_subjects ps ON p.id = ps.package_id"
            conditions.append(f"ps.subject_id = ${idx}")
            params.append(subject_id)
            idx += 1

        if package_type:
            conditions.append(f"p.package_type = ${idx}")
            params.append(package_type)
            idx += 1

        if search:
            conditions.append(f"p.name ILIKE ${idx}")
            params.append(f"%{search}%")
            idx += 1

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        count_row = await conn.fetchrow(
            f"SELECT COUNT(DISTINCT p.id) AS total FROM packages p {joins} {where}",
            *params,
        )
        total = count_row["total"]

        rows = await conn.fetch(
            f"SELECT DISTINCT p.* FROM packages p {joins} {where} "
            f"ORDER BY p.ingested_at DESC OFFSET ${idx} LIMIT ${idx + 1}",
            *params, offset, limit,
        )
        packages = [dict(r) for r in rows]

        if packages:
            pkg_ids = [p["id"] for p in packages]
            link_rows = await conn.fetch(
                "SELECT ps.package_id, s.id, s.name "
                "FROM packages_subjects ps JOIN subjects s ON s.id = ps.subject_id "
                "WHERE ps.package_id = ANY($1::uuid[]) ORDER BY s.name",
                pkg_ids,
            )
            links_by_pkg: dict = {}
            for lr in link_rows:
                pid = lr["package_id"]
                if pid not in links_by_pkg:
                    links_by_pkg[pid] = []
                links_by_pkg[pid].append({"id": lr["id"], "name": lr["name"]})
            for p in packages:
                p["linked_subjects"] = links_by_pkg.get(p["id"], [])

        return {"items": packages, "total": total, "offset": offset, "limit": limit}


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_packages(data: BulkDeleteRequest):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    async with get_conn() as conn:
        result = await conn.execute(
            "DELETE FROM packages WHERE id = ANY($1::uuid[])", data.ids)
        deleted_count = int(result.split()[-1])
        return {"deleted": deleted_count}


@router.get("/{package_id}", response_model=PackageResponse)
async def get_package(package_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM packages WHERE id = $1", package_id)
        if not row:
            raise HTTPException(status_code=404, detail="Package not found")
        result = dict(row)
        subject_rows = await conn.fetch(
            "SELECT s.id, s.name FROM subjects s "
            "JOIN packages_subjects ps ON s.id = ps.subject_id "
            "WHERE ps.package_id = $1 ORDER BY s.name", package_id)
        result["linked_subjects"] = [dict(r) for r in subject_rows]
        return result


@router.get("/{package_id}/summary", response_model=PackageSummary)
async def get_package_summary(package_id: UUID):
    """Aggregate stats for a package — face metadata, pose ranges, quality, etc."""
    async with get_conn() as conn:
        row = await conn.fetchrow("""
            SELECT
                COUNT(*)                                           AS total_assets,
                COUNT(*) FILTER (WHERE file_type = 'video')        AS video_count,
                COUNT(*) FILTER (WHERE file_type = 'image')        AS image_count,
                COUNT(*) FILTER (WHERE asset_type = 'aligned')     AS aligned_count,
                COUNT(*) FILTER (WHERE asset_type = 'grid')        AS grid_count,
                COUNT(*) FILTER (WHERE asset_type = 'plate')       AS plate_count,
                COUNT(*) FILTER (WHERE asset_type = 'raw')         AS raw_count,
                COUNT(*) FILTER (WHERE asset_type = 'graded')      AS graded_count,
                COUNT(*) FILTER (WHERE asset_type = 'proxy')       AS proxy_count,
                COUNT(*) FILTER (WHERE asset_type = 'metadata')    AS metadata_count,
                COUNT(*) FILTER (WHERE picked_up)                  AS picked_up_count,
                COALESCE(SUM(duration_seconds)
                    FILTER (WHERE file_type = 'video'), 0)         AS total_duration,
                MODE() WITHIN GROUP (ORDER BY width)
                    FILTER (WHERE width IS NOT NULL)               AS common_width,
                MODE() WITHIN GROUP (ORDER BY height)
                    FILTER (WHERE height IS NOT NULL)              AS common_height,
                array_agg(DISTINCT metadata->'face'->>'face_type')
                    FILTER (WHERE metadata->'face'->>'face_type' IS NOT NULL) AS face_types,
                MAX((metadata->'face'->>'source_width')::int)
                    FILTER (WHERE metadata->'face'->>'source_width' IS NOT NULL) AS source_width,
                MAX((metadata->'face'->>'source_height')::int)
                    FILTER (WHERE metadata->'face'->>'source_height' IS NOT NULL) AS source_height,
                MIN((metadata->'face'->>'yaw')::float)
                    FILTER (WHERE metadata->'face'->>'yaw' IS NOT NULL) AS yaw_min,
                MAX((metadata->'face'->>'yaw')::float)
                    FILTER (WHERE metadata->'face'->>'yaw' IS NOT NULL) AS yaw_max,
                MIN((metadata->'face'->>'pitch')::float)
                    FILTER (WHERE metadata->'face'->>'pitch' IS NOT NULL) AS pitch_min,
                MAX((metadata->'face'->>'pitch')::float)
                    FILTER (WHERE metadata->'face'->>'pitch' IS NOT NULL) AS pitch_max,
                AVG((metadata->'face'->>'sharpness')::float)
                    FILTER (WHERE metadata->'face'->>'sharpness' IS NOT NULL) AS avg_sharpness,
                array_agg(DISTINCT camera)
                    FILTER (WHERE camera IS NOT NULL)              AS cameras,
                array_agg(DISTINCT codec)
                    FILTER (WHERE codec IS NOT NULL)               AS codecs
            FROM assets WHERE package_id = $1
        """, package_id)
        if not row or row["total_assets"] == 0:
            raise HTTPException(status_code=404, detail="Package not found or has no assets")
        result = dict(row)

        pkg = await conn.fetchrow("SELECT metadata FROM packages WHERE id = $1", package_id)
        if pkg and pkg["metadata"]:
            meta = _json.loads(pkg["metadata"]) if isinstance(pkg["metadata"], str) else pkg["metadata"]
            if meta.get("source_video_path"):
                result["source_video_path"] = meta["source_video_path"]
            if meta.get("source_video_filename"):
                result["source_video_filename"] = meta["source_video_filename"]
            if meta.get("grid_asset_id"):
                result["grid_asset_id"] = meta["grid_asset_id"]

        pose_rows = await conn.fetch("""
            SELECT (FLOOR((metadata->'face'->>'yaw')::float / 10) * 10)::int AS y,
                   (FLOOR((metadata->'face'->>'pitch')::float / 10) * 10)::int AS p,
                   COUNT(*) AS count
            FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
              AND metadata->'face'->>'yaw' IS NOT NULL
            GROUP BY 1, 2
        """, package_id)
        if pose_rows:
            result["pose_data"] = [dict(r) for r in pose_rows]

        return result


@router.post("", response_model=PackageResponse, status_code=201)
async def create_package(data: PackageCreate):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO packages (subject_id, name, source_description, disk_path, tags, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *""",
            data.subject_id, data.name, data.source_description,
            data.disk_path, data.tags, data.metadata,
        )
        return dict(row)


@router.put("/{package_id}", response_model=PackageResponse)
async def update_package(package_id: UUID, data: PackageUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql, vals = build_update("packages", updates, package_id)
    async with get_conn() as conn:
        row = await conn.fetchrow(sql, *vals)
        if not row:
            raise HTTPException(status_code=404, detail="Package not found")
        return dict(row)


@router.delete("/{package_id}", status_code=204)
async def delete_package(package_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM packages WHERE id = $1 RETURNING id", package_id)
        if not row:
            raise HTTPException(status_code=404, detail="Package not found")


@router.post("/{package_id}/backfill-face-metadata")
async def backfill_face_metadata(package_id: UUID):
    """Re-extract face metadata from aligned PNGs and update assets + package summary.

    Useful for packages ingested before face metadata extraction was added.
    Streams SSE progress events.
    """
    import asyncio

    async def _stream():
        async with get_conn() as conn:
            pkg = await conn.fetchrow("SELECT id FROM packages WHERE id = $1", package_id)
            if not pkg:
                yield f"data: {_json.dumps({'error': 'Package not found'})}\n\n"
                return

            rows = await conn.fetch("""
                SELECT id, disk_path
                FROM assets
                WHERE package_id = $1
                  AND asset_type = 'aligned'
                  AND disk_path LIKE '%%.png'
                  AND (metadata->'face' IS NULL OR metadata->'face' = 'null')
            """, package_id)

            total = len(rows)
            yield f"data: {_json.dumps({'status': 'started', 'total': total})}\n\n"

            loop = asyncio.get_event_loop()
            updated = 0
            errors = 0
            batch_size = 200

            with ThreadPoolExecutor(max_workers=8) as executor:
                for batch_start in range(0, total, batch_size):
                    batch = rows[batch_start:batch_start + batch_size]

                    def _read(disk_path):
                        return read_face_metadata(disk_path)

                    futs = [(executor.submit(_read, r["disk_path"]), r) for r in batch]
                    updates = []
                    for fut, row in futs:
                        try:
                            meta = await loop.run_in_executor(None, fut.result, 30)
                            if meta:
                                updates.append((row["id"], meta))
                        except Exception as e:
                            errors += 1
                            log.warning("backfill error for %s: %s", row["disk_path"], e)

                    # Batch update using unnest for performance.
                    # asyncpg jsonb codec auto-serializes dicts, so pass raw dicts.
                    if updates:
                        ids = [u[0] for u in updates]
                        faces = [_json.dumps(u[1]) for u in updates]
                        await conn.execute("""
                            UPDATE assets a
                            SET metadata = jsonb_set(a.metadata, '{face}', v.face::jsonb)
                            FROM unnest($1::uuid[], $2::text[]) AS v(id, face)
                            WHERE a.id = v.id
                        """, ids, faces)
                    updated += len(updates)

                    yield f"data: {_json.dumps({'status': 'progress', 'processed': min(batch_start + batch_size, total), 'total': total, 'updated': updated})}\n\n"

            yield f"data: {_json.dumps({'status': 'aggregating'})}\n\n"

            face_agg = await conn.fetchrow("""
                SELECT
                    COUNT(*) FILTER (WHERE asset_type = 'aligned') AS aligned_count,
                    jsonb_agg(DISTINCT metadata->'face'->>'face_type')
                        FILTER (WHERE metadata->'face'->>'face_type' IS NOT NULL) AS face_types,
                    MAX((metadata->'face'->>'source_width')::int)
                        FILTER (WHERE metadata->'face'->>'source_width' IS NOT NULL) AS source_width,
                    MAX((metadata->'face'->>'source_height')::int)
                        FILTER (WHERE metadata->'face'->>'source_height' IS NOT NULL) AS source_height
                FROM assets WHERE package_id = $1
            """, package_id)

            merge: dict = {}
            if face_agg:
                merge["aligned_count"] = face_agg["aligned_count"]
                if face_agg["face_types"]:
                    ft = face_agg["face_types"]
                    merge["face_types"] = _json.loads(ft) if isinstance(ft, str) else ft
                if face_agg["source_width"]:
                    merge["source_width"] = face_agg["source_width"]
                if face_agg["source_height"]:
                    merge["source_height"] = face_agg["source_height"]

            pose_rows = await conn.fetch("""
                SELECT (FLOOR((metadata->'face'->>'yaw')::float / 10) * 10)::int AS y,
                       (FLOOR((metadata->'face'->>'pitch')::float / 10) * 10)::int AS p,
                       COUNT(*) AS count
                FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
                  AND metadata->'face'->>'yaw' IS NOT NULL
                GROUP BY 1, 2
            """, package_id)
            if pose_rows:
                merge["pose_data"] = [{"y": r["y"], "p": r["p"], "count": r["count"]} for r in pose_rows]

            src = await conn.fetchrow("""
                SELECT metadata->'face'->>'source_filepath' AS path,
                       metadata->'face'->>'source_filename' AS name
                FROM assets WHERE package_id = $1 AND asset_type = 'aligned'
                  AND metadata->'face'->>'source_filepath' IS NOT NULL LIMIT 1
            """, package_id)
            if src and src["path"]:
                merge["source_video_path"] = src["path"]
                if src["name"]:
                    merge["source_video_filename"] = src["name"]

            if merge:
                await conn.execute(
                    "UPDATE packages SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::text::jsonb WHERE id = $2",
                    _json.dumps(merge), package_id,
                )

            pose_count = len(pose_rows) if pose_rows else 0
            yield f"data: {_json.dumps({'status': 'done', 'updated': updated, 'errors': errors, 'pose_count': pose_count})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.get("/{package_id}/assets", response_model=PaginatedAssetResponse)
async def list_package_assets(
    package_id: UUID,
    subject_id: Optional[UUID] = Query(None),
    file_type: Optional[str] = Query(None),
    asset_type: Optional[str] = Query(None),
    picked_up: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    pose_bins: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    """Get paginated assets for a package."""
    base_where = "a.package_id = $1"
    base_params: list = [package_id]

    if subject_id:
        base_where += f" AND a.subject_id = ${len(base_params) + 1}"
        base_params.append(subject_id)

    where, extra_params = _build_asset_filters(
        file_type=file_type,
        asset_type=asset_type,
        picked_up=picked_up,
        search=search,
        pose_bins=pose_bins,
        base_where=base_where,
        param_offset=len(base_params),
    )
    params = base_params + extra_params

    async with get_conn() as conn:
        return await _paginated_asset_query(
            conn,
            from_clause="assets a",
            where=where,
            params=params,
            offset=offset,
            limit=limit,
        )
