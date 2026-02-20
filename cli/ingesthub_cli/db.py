"""Database operations for IngestHub CLI."""

import os
import uuid
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# Register UUID adapter
psycopg2.extras.register_uuid()


def get_connection_string() -> str:
    """Build connection string from env vars."""
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://{user}:{password}@{host}:{port}/{dbname}".format(
            user=os.environ.get("DB_USER", "ingesthub"),
            password=os.environ.get("DB_PASSWORD", "ingesthub_dev_2024"),
            host=os.environ.get("DB_HOST", "localhost"),
            port=os.environ.get("DB_PORT", "5432"),
            dbname=os.environ.get("DB_NAME", "ingesthub"),
        ),
    )


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = psycopg2.connect(get_connection_string())
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Projects ────────────────────────────────────────────────


def get_or_create_project(conn, name: str, description: str = "", project_type: str = "atman") -> uuid.UUID:
    """Get existing project by name or create a new one. Returns project ID."""
    cur = conn.cursor()

    cur.execute("SELECT id FROM projects WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        return row[0]

    project_id = uuid.uuid4()
    cur.execute(
        """
        INSERT INTO projects (id, name, description, project_type)
        VALUES (%s, %s, %s, %s)
        """,
        (project_id, name, description, project_type),
    )
    return project_id


def list_projects(conn) -> list[dict]:
    """List all projects with summary stats."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM v_project_summary ORDER BY created_at DESC")
    return cur.fetchall()


# ── Subjects ────────────────────────────────────────────────


def get_or_create_subject(conn, project_id: uuid.UUID, name: str, description: str = "") -> uuid.UUID:
    """Get existing subject or create a new one. Returns subject ID."""
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM subjects WHERE project_id = %s AND name = %s",
        (project_id, name),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    subject_id = uuid.uuid4()
    cur.execute(
        """
        INSERT INTO subjects (id, project_id, name, description)
        VALUES (%s, %s, %s, %s)
        """,
        (subject_id, project_id, name, description),
    )
    return subject_id


def update_subject_thumbnail(conn, subject_id: uuid.UUID, thumbnail_url: str):
    """Set or update a subject's thumbnail."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE subjects SET thumbnail_url = %s WHERE id = %s",
        (thumbnail_url, subject_id),
    )


# ── Packages ────────────────────────────────────────────────


def create_package(
    conn,
    subject_id: uuid.UUID,
    name: str,
    disk_path: str,
    source_description: str = "",
    tags: list | None = None,
    metadata: dict | None = None,
) -> uuid.UUID:
    """Create a new ingest package. Returns package ID."""
    cur = conn.cursor()

    # Check for existing package with same name under this subject
    cur.execute(
        "SELECT id FROM packages WHERE subject_id = %s AND name = %s",
        (subject_id, name),
    )
    row = cur.fetchone()
    if row:
        raise ValueError(
            f"Package '{name}' already exists for this subject (id={row[0]}). "
            "Use --force to re-ingest or choose a different package name."
        )

    package_id = uuid.uuid4()
    cur.execute(
        """
        INSERT INTO packages (id, subject_id, name, disk_path, source_description, tags, metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            package_id,
            subject_id,
            name,
            disk_path,
            source_description,
            tags or [],
            psycopg2.extras.Json(metadata or {}),
        ),
    )
    return package_id


def update_package_stats(conn, package_id: uuid.UUID, file_count: int, total_size: int, status: str = "ready"):
    """Update package after all assets are ingested."""
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE packages SET file_count = %s, total_size_bytes = %s, status = %s
        WHERE id = %s
        """,
        (file_count, total_size, status, package_id),
    )


def delete_package(conn, package_id: uuid.UUID):
    """Delete a package and all its assets (cascading)."""
    cur = conn.cursor()
    cur.execute("DELETE FROM packages WHERE id = %s", (package_id,))


# ── Assets ──────────────────────────────────────────────────


def insert_asset(conn, asset: dict) -> uuid.UUID:
    """Insert a single asset record. Returns asset ID."""
    cur = conn.cursor()
    asset_id = uuid.uuid4()
    cur.execute(
        """
        INSERT INTO assets (
            id, package_id, filename, file_type, mime_type,
            file_size_bytes, disk_path, proxy_path, thumbnail_path,
            width, height, duration_seconds, codec, camera,
            tags, metadata
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s
        )
        """,
        (
            asset_id,
            asset["package_id"],
            asset["filename"],
            asset["file_type"],
            asset.get("mime_type"),
            asset.get("file_size_bytes"),
            asset["disk_path"],
            asset.get("proxy_path"),
            asset.get("thumbnail_path"),
            asset.get("width"),
            asset.get("height"),
            asset.get("duration_seconds"),
            asset.get("codec"),
            asset.get("camera"),
            asset.get("tags", []),
            psycopg2.extras.Json(asset.get("metadata", {})),
        ),
    )
    return asset_id


def bulk_insert_assets(conn, assets: list[dict]) -> int:
    """Insert multiple assets efficiently. Returns count inserted."""
    count = 0
    for asset in assets:
        insert_asset(conn, asset)
        count += 1
    return count
