"""Subject endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from ..database import get_conn, build_update
from ..models import BulkDeleteRequest, PaginatedAssetResponse, SubjectCreate, SubjectResponse, SubjectUpdate
from .media import make_media_url
from .assets import _build_asset_filters, _paginated_asset_query

router = APIRouter()


def normalize_subject_name(name: str) -> str:
    """Normalize subject name: strip, replace underscores with spaces, title case."""
    return name.strip().replace('_', ' ').title()


def _enrich_subject(row: dict) -> dict:
    """Convert filesystem thumbnail_url to a /media/ URL."""
    raw = row.get("thumbnail_url")
    if raw:
        row["thumbnail_url"] = make_media_url(raw) or raw
    return row


@router.get("", response_model=list[SubjectResponse])
async def list_subjects(project_id: Optional[UUID] = Query(None)):
    async with get_conn() as conn:
        if project_id:
            rows = await conn.fetch(
                "SELECT * FROM v_subject_summary WHERE project_id = $1 ORDER BY name",
                project_id,
            )
        else:
            rows = await conn.fetch("SELECT * FROM v_subject_summary ORDER BY name")
        return [_enrich_subject(dict(r)) for r in rows]


@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(subject_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM v_subject_summary WHERE id = $1", subject_id)
        if not row:
            raise HTTPException(status_code=404, detail="Subject not found")
        return _enrich_subject(dict(row))


@router.post("", response_model=SubjectResponse, status_code=201)
async def create_subject(data: SubjectCreate):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO subjects (project_id, name, description, notes, tags)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id""",
            data.project_id, normalize_subject_name(data.name), data.description, data.notes, data.tags,
        )
        subject_id = row["id"]
        result = await conn.fetchrow("SELECT * FROM v_subject_summary WHERE id = $1", subject_id)
        return _enrich_subject(dict(result))


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(subject_id: UUID, data: SubjectUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if 'name' in updates:
        updates['name'] = normalize_subject_name(updates['name'])
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql, vals = build_update("subjects", updates, subject_id)
    async with get_conn() as conn:
        row = await conn.fetchrow(sql, *vals)
        if not row:
            raise HTTPException(status_code=404, detail="Subject not found")
        result = await conn.fetchrow("SELECT * FROM v_subject_summary WHERE id = $1", subject_id)
        return _enrich_subject(dict(result))


@router.delete("/{subject_id}", status_code=204)
async def delete_subject(subject_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM subjects WHERE id = $1 RETURNING id", subject_id)
        if not row:
            raise HTTPException(status_code=404, detail="Subject not found")


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_subjects(data: BulkDeleteRequest):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    async with get_conn() as conn:
        result = await conn.execute(
            "DELETE FROM subjects WHERE id = ANY($1::uuid[])", data.ids)
        deleted_count = int(result.split()[-1])
        return {"deleted": deleted_count}


@router.get("/{subject_id}/packages")
async def list_subject_packages(
    subject_id: UUID,
    package_type: Optional[str] = Query(None),
):
    async with get_conn() as conn:
        if package_type:
            rows = await conn.fetch(
                """SELECT p.* FROM packages p
                   JOIN packages_subjects ps ON p.id = ps.package_id
                   WHERE ps.subject_id = $1 AND p.package_type = $2
                   ORDER BY p.ingested_at DESC""",
                subject_id, package_type,
            )
        else:
            rows = await conn.fetch(
                """SELECT p.* FROM packages p
                   JOIN packages_subjects ps ON p.id = ps.package_id
                   WHERE ps.subject_id = $1
                   ORDER BY p.ingested_at DESC""",
                subject_id,
            )
        return [dict(r) for r in rows]



@router.get("/{subject_id}/assets", response_model=PaginatedAssetResponse)
async def list_subject_assets(
    subject_id: UUID,
    package_id: Optional[UUID] = Query(None),
    file_type: Optional[str] = Query(None),
    asset_type: Optional[str] = Query(None),
    picked_up: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    """Get paginated assets for a subject across all its packages."""
    # Filter assets directly by their subject_id (supports multi-subject packages)
    base_where = f"a.subject_id = $1"
    base_params: list = [subject_id]

    where, extra_params = _build_asset_filters(
        package_id=package_id,
        file_type=file_type,
        asset_type=asset_type,
        picked_up=picked_up,
        search=search,
        base_where=base_where,
        param_offset=len(base_params),
    )
    params = base_params + extra_params

    async with get_conn() as conn:
        return await _paginated_asset_query(
            conn,
            from_clause="assets a JOIN packages p ON a.package_id = p.id",
            where=where,
            params=params,
            offset=offset,
            limit=limit,
        )
