"""Shared test fixtures.

Uses the real dev database (same as `make db`).  Each test runs inside a
savepoint that is rolled back afterwards, so tests never leave data behind.
"""

import json
from contextlib import asynccontextmanager

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

DSN = "postgresql://ingesthub:ingesthub_dev_2024@localhost:5432/ingesthub"


async def _init_conn(conn):
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


class _MockPool:
    """Fake pool that always yields the same test connection."""

    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        conn = self._conn

        @asynccontextmanager
        async def _acquire():
            yield conn

        return _acquire()

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# Per-test connection wrapped in a transaction (auto-rollback)
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_conn():
    """Yield a connection with an active transaction that rolls back after the test."""
    conn = await asyncpg.connect(dsn=DSN)
    await _init_conn(conn)
    tx = conn.transaction()
    await tx.start()
    yield conn
    await tx.rollback()
    await conn.close()


# ---------------------------------------------------------------------------
# Patched FastAPI app — swaps the pool for a mock that uses the test connection
# ---------------------------------------------------------------------------


@pytest.fixture
async def client(db_conn: asyncpg.Connection):
    """httpx AsyncClient wired to the FastAPI app with the DB pool swapped
    for a mock that always yields the test connection (so all changes roll back)."""
    import api.database as db_mod

    old_pool = db_mod.pool
    db_mod.pool = _MockPool(db_conn)  # type: ignore[assignment]

    from api.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    db_mod.pool = old_pool


# ---------------------------------------------------------------------------
# Seed-data helpers
# ---------------------------------------------------------------------------


@pytest.fixture
async def seed_project(db_conn: asyncpg.Connection) -> dict:
    """Insert a test project and return its dict."""
    row = await db_conn.fetchrow(
        "INSERT INTO projects (name, description, project_type, tags) VALUES ($1, $2, $3, $4) RETURNING *",
        "Test Project",
        "A test project",
        "atman",
        [],
    )
    return dict(row)


@pytest.fixture
async def seed_subject(db_conn: asyncpg.Connection, seed_project: dict) -> dict:
    """Insert a test subject linked to the seed project."""
    row = await db_conn.fetchrow(
        "INSERT INTO subjects (project_id, name, description, tags) VALUES ($1, $2, $3, $4) RETURNING *",
        seed_project["id"],
        "Test Subject",
        "A test subject",
        [],
    )
    return dict(row)


@pytest.fixture
async def seed_package(db_conn: asyncpg.Connection, seed_subject: dict) -> dict:
    """Insert a test package linked to the seed subject."""
    row = await db_conn.fetchrow(
        "INSERT INTO packages (subject_id, name, source_description, tags, metadata, package_type) "
        "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        seed_subject["id"],
        "test-pkg-001",
        "Test package",
        [],
        {},
        "atman",
    )
    # Also create the packages_subjects link
    await db_conn.execute(
        "INSERT INTO packages_subjects (package_id, subject_id) VALUES ($1, $2)",
        row["id"],
        seed_subject["id"],
    )
    return dict(row)


@pytest.fixture
async def seed_asset(db_conn: asyncpg.Connection, seed_package: dict, seed_subject: dict) -> dict:
    """Insert a test asset in the seed package."""
    row = await db_conn.fetchrow(
        "INSERT INTO assets (package_id, subject_id, filename, file_type, asset_type, "
        "file_size_bytes, disk_path, tags, metadata) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
        seed_package["id"],
        seed_subject["id"],
        "frame_0001.png",
        "image",
        "aligned",
        1024,
        "/tmp/test/frame_0001.png",
        [],
        {},
    )
    return dict(row)
