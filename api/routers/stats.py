"""Dashboard statistics endpoint."""

from fastapi import APIRouter

from ..database import get_conn
from ..models import DashboardStats

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats():
    async with get_conn() as conn:
        counts = await conn.fetchrow("""
            SELECT
                (SELECT count(*) FROM projects) AS total_projects,
                (SELECT count(*) FROM subjects) AS total_subjects,
                (SELECT count(*) FROM packages) AS total_packages,
                (SELECT count(*) FROM packages WHERE package_type = 'atman') AS total_raw_packages,
                (SELECT count(*) FROM packages WHERE package_type = 'vfx') AS total_datasets,
                (SELECT count(*) FROM assets) AS total_assets,
                (SELECT COALESCE(SUM(file_size_bytes), 0) FROM assets) AS total_size_bytes
        """)
        by_type_rows = await conn.fetch(
            "SELECT file_type, count(*) AS n FROM assets GROUP BY file_type"
        )
        by_status_rows = await conn.fetch(
            "SELECT review_status, count(*) AS n FROM assets GROUP BY review_status"
        )
        recent_rows = await conn.fetch("""
            SELECT pkg.*,
                   agg.subject_names, agg.subject_ids,
                   p.name AS project_name, p.id AS project_id
            FROM packages pkg
            JOIN LATERAL (
                SELECT string_agg(s.name, ', ' ORDER BY s.name) AS subject_names,
                       string_agg(s.id::text, ',' ORDER BY s.name) AS subject_ids,
                       (MIN(s.project_id::text))::uuid AS project_id
                FROM packages_subjects ps JOIN subjects s ON s.id = ps.subject_id
                WHERE ps.package_id = pkg.id
            ) agg ON true
            JOIN projects p ON p.id = agg.project_id
            ORDER BY pkg.ingested_at DESC LIMIT 20
        """)
        storage_rows = await conn.fetch("""
            SELECT p.name AS project_name,
                   COALESCE(SUM(pkg.total_size_bytes), 0) AS total_bytes
            FROM projects p
            LEFT JOIN subjects s ON s.project_id = p.id
            LEFT JOIN packages_subjects ps ON ps.subject_id = s.id
            LEFT JOIN packages pkg ON pkg.id = ps.package_id
            GROUP BY p.id, p.name
            ORDER BY total_bytes DESC
        """)

        assets_by_type = {r["file_type"]: r["n"] for r in by_type_rows}
        assets_by_review_status = {r["review_status"]: r["n"] for r in by_status_rows}
        recent_packages = [dict(r) for r in recent_rows]
        storage_by_project = [dict(r) for r in storage_rows]

        return DashboardStats(
            total_projects=counts["total_projects"],
            total_subjects=counts["total_subjects"],
            total_packages=counts["total_packages"],
            total_raw_packages=counts["total_raw_packages"],
            total_datasets=counts["total_datasets"],
            total_assets=counts["total_assets"],
            total_size_bytes=counts["total_size_bytes"],
            assets_by_type=assets_by_type,
            assets_by_review_status=assets_by_review_status,
            recent_packages=recent_packages,
            storage_by_project=storage_by_project,
        )
