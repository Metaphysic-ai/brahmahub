"""asyncpg connection pool and helpers."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg

from .config import settings

pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn):
    """Set up JSONB codec on each new connection."""
    await conn.set_type_codec(
        'jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog'
    )


async def init_pool():
    """Initialize the connection pool. Called at app startup."""
    global pool
    pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        init=_init_connection,
    )


async def close_pool():
    """Close all pooled connections. Called at app shutdown."""
    global pool
    if pool:
        await pool.close()
        pool = None


@asynccontextmanager
async def get_conn():
    """Yield a connection from the pool."""
    async with pool.acquire() as conn:
        yield conn


def build_update(table: str, data: dict, id_val, id_col: str = "id"):
    """Build UPDATE SET clause with positional params for asyncpg.

    Returns (sql, values_list). The SQL includes RETURNING *.
    The id value is appended as the last positional param.
    """
    fields = list(data.keys())
    sets = ", ".join(f"{f} = ${i+1}" for i, f in enumerate(fields))
    vals = list(data.values())
    vals.append(id_val)
    return f"UPDATE {table} SET {sets} WHERE {id_col} = ${len(vals)} RETURNING *", vals
