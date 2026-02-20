# BrahmaHub

[![CI](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/ci.yml/badge.svg)](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/codeql.yml/badge.svg)](https://github.com/Metaphysic-ai/brahmahub/actions/workflows/codeql.yml)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776ab?logo=python&logoColor=white)
![Node 24](https://img.shields.io/badge/node-24-5fa04e?logo=node.js&logoColor=white)
![mise](https://img.shields.io/badge/mise-task_runner-4e4e91)

Data catalog for browsing and managing gen AI training data. Scans media directories, extracts metadata, generates web-playable proxies, and provides a web UI for browsing projects, subjects, packages, and assets.

---

## Quick Start

You need [mise](https://mise.jdx.dev/) (2026.2+), PostgreSQL 16+, and ffmpeg. mise manages everything else (Python, Node, pnpm, ruff, etc.).

```bash
# 1. Clone and enter
git clone https://github.com/Metaphysic-ai/brahmahub.git
cd brahmahub

# 2. Trust mise config and bootstrap
#    Creates .env, database, installs all runtimes + deps + git hooks
mise trust
mise run setup

# 3. Edit .env — set at minimum:
#    MEDIA_ROOT_PATHS=/mnt/data,/mnt/x
#    GEMINI_API_KEY=your-key-here

# 4. Start everything
mise run dev
```

> [!NOTE]
> Setup assumes the PostgreSQL superuser password is `postgres`. Override with `PGPASSWORD=yourpass mise run setup`.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| API | http://localhost:8000/api |
| API docs | http://localhost:8000/docs |

---

## Project Structure

```
api/                  # FastAPI backend (async, asyncpg)
  routers/            #   Route handlers
  services/           #   Business logic (analyzer, metadata, datasets)
  config.py           #   Settings from environment
  database.py         #   asyncpg connection pool
  models.py           #   Pydantic models
  main.py             #   App entry point + lifespan
frontend/             # React + TypeScript + Vite + shadcn/ui
  src/
    pages/            #   Route pages
    components/       #   UI components
    hooks/            #   TanStack Query hooks
    services/         #   API client functions
    types/            #   TypeScript interfaces
cli/                  # CLI ingest tool (ihub)
db/migrations/        # SQL migrations
deploy/               # systemd + Traefik configs
tests/                # API integration tests (pytest + httpx)
```

---

## Data Model

```mermaid
graph LR
    A[Project] --> B[Subject]
    B --> C[Package]
    C --> D[Asset]
    B -. "M:M" .-> C
```

- **Projects** group related work (e.g. a client engagement)
- **Subjects** are individuals or entities within a project
- **Packages** are ingested batches of media (type: `atman` or `vfx`)
- **Assets** are individual media files with metadata, proxies, and thumbnails

Packages can belong to multiple subjects (M:M via `packages_subjects`).

---

## Architecture

```mermaid
graph LR
    A[Internet / LAN] --> B["Traefik :443
    TLS termination"]
    B --> C["FastAPI :8000"]
    C --> D["/api/* — REST API"]
    C --> E["/media/* — file serving"]
    C --> F["/* — frontend/dist/ (SPA)"]
```

- **systemd** manages the process (`Restart=always` for self-update restarts)
- **Traefik** handles TLS (Let's Encrypt DNS-01 / Route53) and reverse proxying
- **FastAPI** serves both the API and the pre-built frontend (`frontend/dist/`)
- **Migrations** run automatically at startup via the lifespan
- **Auto-update** checks GitHub Releases every 5 minutes and applies updates automatically (git checkout + frontend dist download + systemd restart)

---

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DATABASE_URL` | `postgresql://ingesthub:...@localhost:5432/ingesthub` | Database connection URL |
| `MEDIA_ROOT_PATHS` | — | Comma-separated dirs the API can serve files from |
| `PROXY_DIR` | `.ingesthub_proxies` | Where generated proxies and thumbnails are stored |
| `DATASETS_ROOT` | — | Root dir for dataset symlink mapping during ingest |
| `GEMINI_API_KEY` | — | Gemini API key for ATMAN path analysis |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins |
| `UPDATE_REPO` | — | GitHub repo for self-update (e.g., `Metaphysic-ai/brahmahub`) |
| `GITHUB_APP_ID` | — | `brahmahub-updater` App ID |
| `GITHUB_PRIVATE_KEY_PATH` | — | Path to updater app `.pem` file |
| `GITHUB_INSTALLATION_ID` | — | Updater app installation ID |
| `AUTO_UPDATE_INTERVAL` | `300` | Seconds between update checks (0 to disable) |

---

## GitHub Apps

Two apps handle automation, separated by least privilege.

| App | Purpose | Permissions | Config |
|-----|---------|-------------|--------|
| `brahmahub-updater` | Production: pull releases | Contents: **read** | Server `.env` |
| `brahmahub-release` | CI: create + merge Release PRs | Contents: **read/write**, PRs: **read/write** | GitHub Actions vars/secrets |

**Why two?** The updater runs on the production server with a PEM on disk — read-only limits damage if the key leaks. The release app runs only in CI and has write access scoped to creating Release PRs and pushing changelogs. It bypasses branch protection so Release PRs auto-merge without manual approval.

> [!TIP]
> See [`deploy/README.md`](deploy/README.md#github-app-setup) for step-by-step setup instructions for both apps.

---

<p align="center">
  <a href="DEVELOPMENT.md">Development Guide</a> · <a href="deploy/README.md">Deployment Guide</a>
</p>
