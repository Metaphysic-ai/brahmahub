# BrahmaHub

Data catalog for browsing and managing gen AI training data. Scans media directories, extracts metadata, generates web-playable proxies, and provides a React frontend for browsing projects, subjects, packages, and assets.

## Prerequisites

| Dependency         | Version    | What for                                      |
| ------------------ | ---------- | --------------------------------------------- |
| Python             | 3.9+       | API backend                                   |
| Node.js            | 18+        | Frontend build                                |
| Docker + Compose   | any recent | PostgreSQL database                           |
| ffmpeg + ffprobe   | 5.x+       | Media processing (proxy/thumbnail generation) |

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/cedahlberg/brahmahub.git
cd brahmahub

# 2. Create your .env file
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
# Point to the root(s) where your media lives.
# The API serves files from these directories via /media/ URLs.
MEDIA_ROOT_PATHS=/mnt/data,/mnt/x

# Google Gemini API key (needed for ATMAN package analysis during ingest)
GOOGLE_API_KEY=your-key-here
```

Then start everything:

```bash
# 3. Run it — creates venv, installs deps, starts DB, migrates, starts API + frontend
make dev
```

That's it. Open <http://localhost:8080> in your browser.

- Frontend: <http://localhost:8080>
- API: <http://localhost:8000/api>
- API docs: <http://localhost:8000/docs>

## Make Targets

| Target | Description |
| ------ | ----------- |
| `make dev` | Start everything (DB + migrate + API + frontend) |
| `make stop` | Stop everything |
| `make status` | Show what's running |
| `make db` | Start PostgreSQL only |
| `make db-shell` | Open psql shell |
| `make migrate` | Run SQL migrations |
| `make api` | Start API only (:8000) |
| `make frontend` | Start frontend only (:8080) |
| `make test` | Run all tests (API + frontend) |
| `make test-api` | API tests only (pytest) |
| `make test-fe` | Frontend tests only (vitest) |
| `make typecheck` | TypeScript type check |
| `make lint` | Lint frontend |

## What `make dev` Does

1. Starts PostgreSQL 16 in Docker (if not already running)
2. Runs SQL migrations from `db/migrations/`
3. Creates a Python `.venv` and installs `api/requirements.txt`
4. Installs frontend npm packages
5. Starts the FastAPI server on `:8000` (with hot reload)
6. Starts the Vite dev server on `:8080` (with HMR)

All dependencies are installed automatically on first run. Subsequent runs skip what's already installed.

## Project Structure

```text
brahmahub/
  api/                  # FastAPI backend (async, asyncpg)
    routers/            #   Route handlers
    services/           #   Business logic (analyzer, metadata)
    config.py           #   Settings from environment
    database.py         #   asyncpg connection pool
    models.py           #   Pydantic models
    main.py             #   App entry point
  frontend/             # React + TypeScript + Vite
    src/
      components/       #   UI components (shadcn/ui + custom)
      pages/            #   Route pages
      hooks/            #   React Query hooks
      services/         #   API client functions
      types/            #   TypeScript interfaces
  cli/                  # CLI ingest tool (`ihub`)
  db/migrations/        # SQL migrations (run in order by `make migrate`)
  tests/                # API integration tests (pytest + httpx)
  docker-compose.yml    # PostgreSQL + optional pgAdmin
  Makefile              # All dev commands
```

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DATABASE_URL` | `postgresql://ingesthub:...@localhost:5432/ingesthub` | Database connection URL |
| `MEDIA_ROOT_PATHS` | _(none)_ | Comma-separated dirs the API can serve files from |
| `PROXY_DIR` | `.ingesthub_proxies` | Where generated proxies and thumbnails are stored |
| `DATASETS_ROOT` | _(none)_ | Root dir for dataset symlink mapping during ingest |
| `GOOGLE_API_KEY` | _(none)_ | Gemini API key for ATMAN path analysis |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins |
| `API_PORT` | `8000` | API server port |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `10` | asyncpg connection pool size |

## Data Model

```text
Project > Subject > Package > Asset
```

- **Projects** group related work (e.g. a client engagement)
- **Subjects** are individuals or entities within a project
- **Packages** are ingested batches of media (type: `atman` or `vfx`)
- **Assets** are individual media files with metadata, proxies, and thumbnails

Packages can belong to multiple subjects (M:M via `packages_subjects`).

## Development

**Adding a migration:**
Create a new `.sql` file in `db/migrations/` with the next number prefix (e.g. `002_add_something.sql`), then run `make migrate`.

**Running tests:**

```bash
make test          # all tests (31 API + 32 frontend)
make test-api      # pytest only
make test-fe       # vitest only
```

**Resetting the database:**

```bash
docker compose down -v    # destroys the DB volume
make dev                  # recreates everything from scratch
```
