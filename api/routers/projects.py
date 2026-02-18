"""Project endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from ..database import get_conn, build_update
from ..models import BulkDeleteRequest, ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter()


@router.get("", response_model=list[ProjectResponse])
async def list_projects():
    async with get_conn() as conn:
        rows = await conn.fetch("SELECT * FROM v_project_summary ORDER BY created_at DESC")
        return [dict(r) for r in rows]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM v_project_summary WHERE id = $1", project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(data: ProjectCreate):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO projects (name, description, project_type, client, notes, tags)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id""",
            data.name, data.description, data.project_type,
            data.client, data.notes, data.tags,
        )
        project_id = row["id"]
        result = await conn.fetchrow("SELECT * FROM v_project_summary WHERE id = $1", project_id)
        return dict(result)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: UUID, data: ProjectUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sql, vals = build_update("projects", updates, project_id)
    async with get_conn() as conn:
        row = await conn.fetchrow(sql, *vals)
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        result = await conn.fetchrow("SELECT * FROM v_project_summary WHERE id = $1", project_id)
        return dict(result)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM projects WHERE id = $1 RETURNING id", project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_projects(data: BulkDeleteRequest):
    if not data.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    async with get_conn() as conn:
        result = await conn.execute(
            "DELETE FROM projects WHERE id = ANY($1::uuid[])", data.ids)
        deleted_count = int(result.split()[-1])
        return {"deleted": deleted_count}


@router.get("/{project_id}/subjects")
async def list_project_subjects(project_id: UUID):
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM v_subject_summary WHERE project_id = $1 ORDER BY name",
            project_id,
        )
        return [dict(r) for r in rows]


@router.get("/{project_id}/packages")
async def list_project_packages(
    project_id: UUID,
    package_type: Optional[str] = Query(None),
):
    async with get_conn() as conn:
        base_sql = """SELECT DISTINCT ON (p.id) p.*, s.name AS subject_name
                      FROM packages p
                      JOIN packages_subjects ps ON p.id = ps.package_id
                      JOIN subjects s ON ps.subject_id = s.id
                      WHERE s.project_id = $1"""
        params: list = [project_id]
        if package_type:
            base_sql += " AND p.package_type = $2"
            params.append(package_type)
        base_sql += " ORDER BY p.id, p.ingested_at DESC"
        rows = await conn.fetch(base_sql, *params)
        return [dict(r) for r in rows]
