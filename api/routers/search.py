"""Global search endpoint."""

from fastapi import APIRouter

from ..database import get_conn
from ..models import SearchResults

router = APIRouter()


@router.get("", response_model=SearchResults)
async def search(q: str = ""):
    if not q or len(q) < 2:
        return SearchResults()

    pattern = f"%{q}%"
    async with get_conn() as conn:
        projects = await conn.fetch(
            "SELECT id, name, project_type FROM projects WHERE name ILIKE $1 LIMIT 5",
            pattern,
        )

        subjects = await conn.fetch(
            """SELECT s.id, s.name, s.project_id, p.name AS project_name
               FROM subjects s JOIN projects p ON p.id = s.project_id
               WHERE s.name ILIKE $1 LIMIT 5""",
            pattern,
        )

        packages = await conn.fetch(
            """SELECT pkg.id, pkg.name, pkg.package_type, pkg.subject_id,
                      s.name AS subject_name
               FROM packages pkg JOIN subjects s ON s.id = pkg.subject_id
               WHERE pkg.name ILIKE $1 LIMIT 5""",
            pattern,
        )

        assets = await conn.fetch(
            """SELECT a.id, a.filename, a.file_type, a.package_id
               FROM assets a
               WHERE a.filename ILIKE $1 LIMIT 5""",
            pattern,
        )

        return SearchResults(
            projects=[dict(r) for r in projects],
            subjects=[dict(r) for r in subjects],
            packages=[dict(r) for r in packages],
            assets=[dict(r) for r in assets],
        )
