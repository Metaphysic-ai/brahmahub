"""Asset endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from ..database import get_conn, build_update
from ..models import AssetResponse, AssetUpdate, BulkAssetUpdate, PaginatedAssetResponse
from .media import make_media_url

router = APIRouter()


def _enrich_asset(row: dict) -> dict:
    """Add computed proxy_url and thumbnail_url fields."""
    row["proxy_url"] = make_media_url(row.get("proxy_path"))
    row["thumbnail_url"] = make_media_url(row.get("thumbnail_path"))
    # For images without a proxy, the original file is directly viewable
    if not row["proxy_url"] and row.get("file_type") == "image":
        row["proxy_url"] = make_media_url(row.get("disk_path"))
    return row


def _build_asset_filters(
    *,
    package_id: Optional[UUID] = None,
    file_type: Optional[str] = None,
    asset_type: Optional[str] = None,
    picked_up: Optional[bool] = None,
    search: Optional[str] = None,
    pose_bins: Optional[str] = None,
    base_where: str = "",
    param_offset: int = 0,
) -> tuple[str, list]:
    """Build dynamic WHERE clause and params for asset queries."""
    conditions = []
    params: list = []
    idx = param_offset + 1

    if base_where:
        conditions.append(base_where)

    if package_id is not None:
        conditions.append(f"a.package_id = ${idx}")
        params.append(package_id)
        idx += 1
    if asset_type is not None:
        conditions.append(f"a.asset_type = ${idx}")
        params.append(asset_type)
        idx += 1
    elif file_type is not None:
        if file_type == "aligned":
            conditions.append(f"a.asset_type = ${idx}")
            params.append("aligned")
        else:
            conditions.append(f"a.file_type = ${idx}")
            params.append(file_type)
        idx += 1
    if picked_up is not None:
        conditions.append(f"a.picked_up = ${idx}")
        params.append(picked_up)
        idx += 1
    if search is not None:
        conditions.append(f"a.filename ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1
    if pose_bins is not None:
        bin_list = [b.strip() for b in pose_bins.split(",") if ":" in b]
        if bin_list:
            conditions.append(
                f"(floor((a.metadata->'face'->>'yaw')::float / 10) * 10)::int::text"
                f" || ':' || "
                f"(floor((a.metadata->'face'->>'pitch')::float / 10) * 10)::int::text"
                f" = ANY(${idx}::text[])"
            )
            params.append(bin_list)
            idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return where, params


async def _paginated_asset_query(
    conn,
    *,
    from_clause: str,
    where: str,
    params: list,
    offset: int,
    limit: int,
) -> dict:
    """Execute a paginated asset query with aggregates."""
    param_idx = len(params) + 1

    sql = f"""
        SELECT a.*,
            COUNT(*) OVER() AS _total,
            COUNT(*) FILTER (WHERE a.file_type = 'video') OVER() AS _video_count,
            COUNT(*) FILTER (WHERE a.file_type = 'image') OVER() AS _image_count,
            COALESCE(SUM(a.file_size_bytes) OVER(), 0) AS _agg_size,
            COALESCE(SUM(CASE WHEN a.file_type = 'video' THEN a.duration_seconds ELSE 0 END) OVER(), 0) AS _agg_duration,
            COUNT(*) FILTER (WHERE a.picked_up) OVER() AS _agg_picked_up
        FROM {from_clause}
        {where}
        ORDER BY a.filename
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    params_with_pagination = params + [limit, offset]
    rows = await conn.fetch(sql, *params_with_pagination)

    if not rows:
        # Still need aggregates for empty result — run a count query
        count_sql = f"SELECT COUNT(*) AS cnt FROM {from_clause} {where}"
        count_row = await conn.fetchrow(count_sql, *params)
        total = count_row["cnt"] if count_row else 0
        return {
            "items": [],
            "total": total,
            "offset": offset,
            "limit": limit,
            "video_count": 0,
            "image_count": 0,
            "total_size_bytes": 0,
            "total_duration_seconds": 0.0,
            "picked_up_count": 0,
        }

    first = rows[0]
    items = []
    for r in rows:
        d = dict(r)
        for k in ("_total", "_video_count", "_image_count", "_agg_size", "_agg_duration", "_agg_picked_up"):
            d.pop(k, None)
        items.append(_enrich_asset(d))

    return {
        "items": items,
        "total": first["_total"],
        "offset": offset,
        "limit": limit,
        "video_count": first["_video_count"],
        "image_count": first["_image_count"],
        "total_size_bytes": int(first["_agg_size"] or 0),
        "total_duration_seconds": float(first["_agg_duration"] or 0),
        "picked_up_count": first["_agg_picked_up"],
    }


@router.get("/lookup-by-path")
async def lookup_asset_by_path(disk_path: str = Query(...)):
    """Look up an asset by its disk_path. Returns basic info or null."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, package_id, filename, file_type FROM assets WHERE disk_path = $1 LIMIT 1",
            disk_path,
        )
        if not row:
            return None
        return dict(row)


@router.get("", response_model=PaginatedAssetResponse)
async def list_assets(
    package_id: Optional[UUID] = Query(None),
    file_type: Optional[str] = Query(None),
    asset_type: Optional[str] = Query(None),
    picked_up: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    where, params = _build_asset_filters(
        package_id=package_id,
        file_type=file_type,
        asset_type=asset_type,
        picked_up=picked_up,
        search=search,
    )
    async with get_conn() as conn:
        return await _paginated_asset_query(
            conn,
            from_clause="assets a",
            where=where,
            params=params,
            offset=offset,
            limit=limit,
        )


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(asset_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM assets WHERE id = $1", asset_id)
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")
        return _enrich_asset(dict(row))


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: UUID, data: AssetUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql, vals = build_update("assets", updates, asset_id)
    async with get_conn() as conn:
        row = await conn.fetchrow(sql, *vals)
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")
        return _enrich_asset(dict(row))


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM assets WHERE id = $1 RETURNING id", asset_id)
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")


@router.post("/bulk-update", response_model=list[AssetResponse])
async def bulk_update_assets(data: BulkAssetUpdate):
    """Update multiple assets at once."""
    updates = {k: v for k, v in data.updates.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if not data.asset_ids:
        raise HTTPException(status_code=400, detail="No asset IDs provided")

    fields = list(updates.keys())
    sets = ", ".join(f"{f} = ${i+1}" for i, f in enumerate(fields))
    vals = list(updates.values())
    vals.append(data.asset_ids)
    id_param = f"${len(vals)}"

    sql = f"UPDATE assets SET {sets} WHERE id = ANY({id_param}::uuid[]) RETURNING *"
    async with get_conn() as conn:
        rows = await conn.fetch(sql, *vals)
        return [_enrich_asset(dict(r)) for r in rows]
