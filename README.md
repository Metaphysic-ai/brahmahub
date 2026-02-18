# BrahmaHub

[![CI](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/ci.yml/badge.svg)](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/ci.yml)

Data catalog for browsing and managing gen AI training data. Scans media directories, extracts metadata, generates web-playable proxies, and provides a React frontend for browsing projects, subjects, packages, and assets.

## Prerequisites

| Dependency       | Version | What for                              |
| ---------------- | ------- | ------------------------------------- |
| [mise](https://mise.jdx.dev/) | 2026.2+ | Runtime & task manager (installs everything else) |
| PostgreSQL       | 16+     | Database                              |
| ffmpeg + ffprobe | 5.x+    | Media processing (proxy/thumbnail generation) |

mise automatically manages Python 3.12, Node 24, pnpm, uv, ruff, ty, and lefthook.

## Getting Started

```bash
# 1. Clone and enter
git clone https://github.com/Metaphysic-ai/brahmahub.git
cd brahmahub

# 2. Trust mise config and bootstrap (creates .env, database, installs everything)
mise trust
mise run setup

# 3. Edit .env — set at minimum:
#    MEDIA_ROOT_PATHS=/mnt/data,/mnt/x
#    GEMINI_API_KEY=your-key-here

# 4. Run migrations + start API + frontend
mise run dev
```

Setup assumes the PostgreSQL superuser password is `postgres`. If yours differs: `PGPASSWORD=yourpass mise run setup`.

Open <http://localhost:8080> in your browser.

- Frontend: <http://localhost:8080>
- API: <http://localhost:8000/api>
- API docs: <http://localhost:8000/docs>

## Mise Tasks

| Task | Description |
| ---- | ----------- |
| `mise run dev` | Start everything (migrate + API + frontend) |
| `mise run stop` | Stop API + frontend |
| `mise run status` | Show what's running |
| `mise run db:check` | Verify PostgreSQL is reachable |
| `mise run db:shell` | Open psql shell |
| `mise run migrate` | Run SQL migrations |
| `mise run api` | Start API only (:8000) |
| `mise run frontend` | Start frontend only (:8080) |
| `mise run test` | Run all tests (API + frontend) |
| `mise run test:api` | API tests only (pytest) |
| `mise run test:fe` | Frontend tests only (vitest) |
| `mise run lint` | Lint everything (ruff + biome) |
| `mise run typecheck` | Type check everything (ty + tsc) |
| `mise run fix` | Auto-fix lint + format |
| `mise run format` | Format everything (ruff + biome) |

## Project Structure

```
api/                  # FastAPI backend (async, asyncpg)
  routers/            #   Route handlers
  services/           #   Business logic (analyzer, metadata, datasets)
  config.py           #   Settings from environment
  database.py         #   asyncpg connection pool
  models.py           #   Pydantic models
  main.py             #   App entry point
frontend/             # React + TypeScript + Vite
  src/
    components/       #   UI components (shadcn/ui + custom)
    pages/            #   Route pages
    hooks/            #   TanStack Query hooks
    services/         #   API client functions
    types/            #   TypeScript interfaces
cli/                  # CLI ingest tool (ihub)
db/migrations/        # SQL migrations (applied by mise run migrate)
tests/                # API integration tests (pytest + httpx)
```

## Data Model

```
Project > Subject > Package > Asset
```

- **Projects** group related work (e.g. a client engagement)
- **Subjects** are individuals or entities within a project
- **Packages** are ingested batches of media (type: `atman` or `vfx`)
- **Assets** are individual media files with metadata, proxies, and thumbnails

Packages can belong to multiple subjects (M:M via `packages_subjects`).

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DATABASE_URL` | `postgresql://ingesthub:...@localhost:5432/ingesthub` | Database connection URL |
| `MEDIA_ROOT_PATHS` | _(none)_ | Comma-separated dirs the API can serve files from |
| `PROXY_DIR` | `.ingesthub_proxies` | Where generated proxies and thumbnails are stored |
| `DATASETS_ROOT` | _(none)_ | Root dir for dataset symlink mapping during ingest |
| `GEMINI_API_KEY` | _(none)_ | Gemini API key for ATMAN path analysis |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins |
| `API_PORT` | `8000` | API server port |

## Toolchain

| Tool | Purpose |
| ---- | ------- |
| [mise](https://mise.jdx.dev/) | Runtime management + task runner |
| [uv](https://docs.astral.sh/uv/) | Python packaging |
| [pnpm](https://pnpm.io/) | Node.js packaging |
| [ruff](https://docs.astral.sh/ruff/) | Python linting + formatting |
| [ty](https://docs.astral.sh/ty/) | Python type checking |
| [biome](https://biomejs.dev/) | Frontend linting + formatting |
| [lefthook](https://github.com/evilmartians/lefthook) | Git hooks (pre-commit, pre-push, commit-msg) |

## Development

**Adding a migration:**
Create a new `.sql` file in `db/migrations/` with the next number prefix (e.g. `002_add_something.sql`), then run `mise run migrate`.

**Running tests:**

```bash
mise run test          # all tests
mise run test:api      # pytest only
mise run test:fe       # vitest only
```

**Resetting the database:**

```bash
dropdb ingesthub && createdb ingesthub
mise run migrate
```

**Git hooks:**
Lefthook runs automatically on commit (format staged files) and push (full lint + typecheck + tests). Install with `lefthook install` or `mise run setup`.

**Conventional commits** are enforced: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Scopes: `api`, `frontend`, `cli`, `db`

## Production

mise is for local development only. In production:

```bash
# API — install deps and run uvicorn
uv sync --frozen --no-dev
uv run uvicorn api.main:app --host 0.0.0.0 --port 8000

# Frontend — build static assets and serve with your web server
cd frontend && pnpm install --frozen-lockfile && pnpm build
# Serve frontend/dist/ via nginx, caddy, or CDN

# Database — run migrations against your production DATABASE_URL
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Required env vars in production: `DATABASE_URL`, `MEDIA_ROOT_PATHS`, `GEMINI_API_KEY`, `CORS_ORIGINS`.
