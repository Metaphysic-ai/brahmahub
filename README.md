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
# 1. Install mise (if not already installed)
curl https://mise.jdx.dev/install.sh | sh

# 2. Clone and enter
git clone https://github.com/Metaphysic-ai/brahmahub.git
cd brahmahub

# 3. Trust mise config and bootstrap (creates .env, database, installs everything)
mise trust
mise run setup

# 4. Edit .env — set at minimum:
#    MEDIA_ROOT_PATHS=/mnt/data,/mnt/x
#    GEMINI_API_KEY=your-key-here

# 5. Run migrations + start API + frontend
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
| `mise run setup` | Bootstrap: tools, deps, hooks, .env, database |
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

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DATABASE_URL` | `postgresql://ingesthub:...@localhost:5432/ingesthub` | Database connection URL |
| `MEDIA_ROOT_PATHS` | _(none)_ | Comma-separated dirs the API can serve files from |
| `PROXY_DIR` | `.ingesthub_proxies` | Where generated proxies and thumbnails are stored |
| `DATASETS_ROOT` | _(none)_ | Root dir for dataset symlink mapping during ingest |
| `GEMINI_API_KEY` | _(none)_ | Gemini API key for ATMAN path analysis |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins |
| `UPDATE_REPO` | _(none)_ | GitHub repo for self-update (e.g., `Metaphysic-ai/brahmahub`) |
| `GITHUB_APP_ID` | _(none)_ | GitHub App ID for self-update auth |
| `GITHUB_PRIVATE_KEY_PATH` | _(none)_ | Path to GitHub App private key `.pem` file |
| `GITHUB_INSTALLATION_ID` | _(none)_ | GitHub App installation ID |
| `AUTO_UPDATE_INTERVAL` | `300` | Seconds between auto-update checks (0 to disable) |

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

### Day-to-Day Commands

```bash
mise run dev           # Start everything (DB + migrate + API :8000 + Frontend :8080)
mise run stop          # Stop everything
mise run test          # Run all tests (API + frontend)
mise run test:api      # API tests only (pytest)
mise run test:fe       # Frontend tests only (vitest)
mise run fix           # Auto-fix lint + format issues
```

### Adding a Migration

Create a new `.sql` file in `db/migrations/` with the next number prefix (e.g. `002_add_something.sql`), then run `mise run migrate`. Migrations run automatically on app startup in production — you do not need to deploy them separately.

### Resetting the Database

```bash
dropdb ingesthub && createdb ingesthub
mise run migrate
```

### Git Hooks

Lefthook runs automatically — you do not need to remember to lint or format manually:

| Hook | When | What it does |
|------|------|-------------|
| **pre-commit** | Every commit | Auto-formats staged files (ruff + biome) |
| **commit-msg** | Every commit | Validates conventional commit format |
| **pre-push** | Every push | Runs full lint + typecheck + tests |

If a hook fails, your commit or push is blocked until you fix the issue. Run `mise run fix` to auto-fix most lint/format problems.

Hooks are installed by `mise run setup`. If they stop working: `lefthook install`.

### Commit Messages

Every commit message **must** follow [conventional commits](https://www.conventionalcommits.org/) format. This is enforced by a git hook locally and by CI on PR titles. Your commit messages directly control what version gets released.

**Format:** `type(scope): description`

The scope is optional but recommended. By convention, use lowercase imperative mood for the description ("add feature" not "Added feature") and do not end with a period. The hook enforces the `type(scope):` prefix but not the description style — keep it consistent as a team practice.

**Types and their effect on releases:**

| Type | When to use | Release effect |
|------|-------------|----------------|
| `feat` | New functionality visible to users | Triggers a version bump (patch while pre-1.0, minor after) |
| `fix` | Bug fix | Triggers a patch bump |
| `perf` | Performance improvement | No release (appears in changelog) |
| `docs` | Documentation only | No release |
| `style` | Formatting, whitespace, semicolons | No release |
| `refactor` | Code change that doesn't fix a bug or add a feature | No release |
| `test` | Adding or updating tests | No release |
| `build` | Build system or external dependencies | No release |
| `ci` | CI configuration changes | No release |
| `chore` | Maintenance tasks | No release |
| `revert` | Revert a previous commit | No release |

**Scopes** indicate which part of the codebase is affected: `api`, `frontend`, `cli`, `db`, `deploy`

**Breaking changes:** Add `!` after the type to signal a breaking change. This triggers a larger version bump.

**Examples:**

```bash
# Good
git commit -m "feat(api): add bulk delete endpoint for packages"
git commit -m "fix(frontend): prevent crash on empty asset grid"
git commit -m "refactor(api): extract validation into service layer"
git commit -m "docs: update deployment guide"
git commit -m "feat(api)!: change asset response format"  # breaking change

# Bad — these will be rejected by the commit hook
git commit -m "fixed the bug"              # no type prefix
git commit -m "update stuff"               # no type prefix

# Accepted but avoid — follow the style convention above
git commit -m "feat: Added new Feature."   # prefer lowercase, no trailing period
```

### Pull Request Workflow

1. **Create a branch** from `main` and make your changes
2. **Push and open a PR** — the PR title must also follow conventional commit format (same rules as commit messages). The title determines what version impact label gets applied.
3. **Automated checks run** ("Blocks merge" assumes recommended branch protection is configured):

   | Check | What it does | Blocks merge? |
   |-------|-------------|---------------|
   | **CI** (lint, typecheck, tests) | Runs relevant checks based on which files changed | Yes |
   | **PR Title** | Validates conventional commit format | Yes |
   | **Dependency review** | Flags new dependencies with known vulnerabilities | Yes (high/critical severity) |
   | **CodeQL** | Static security analysis for Python + TypeScript | No (informational) |
   | **Labels** | Auto-applies scope, size, and version impact labels | No |
   | **Migration warning** | Comments if `db/migrations/` files are changed | No |

   > **Note:** Version impact labels (`minor`, `patch`, etc.) reflect standard semver intent. While pre-1.0, the actual release bump is smaller than the label suggests (see [Releasing](#releasing)).

4. **CI is path-filtered** — if your PR only touches `frontend/` files, API lint/tests are skipped (and vice versa). This is expected, not an error.
5. **Get a review and merge** — all required status checks must pass. Squash commits are fine; the **PR title** is what matters for the changelog (not individual commit messages).

### Do's and Don'ts

| Do | Don't |
|----|-------|
| Use `mise run` commands for all tasks | Run `pip install`, `npm install`, or other direct package managers |
| Use `uv` for Python deps, `pnpm` for Node deps | Use `pip`, `npm`, or `yarn` |
| Write conventional commit messages | Write freeform commit messages |
| Run `mise run fix` before committing if hooks fail | Skip hooks with `--no-verify` |
| Test locally before pushing (`mise run test`) | Rely solely on CI to catch issues |
| Create focused PRs (one feature/fix per PR) | Bundle unrelated changes in one PR |
| Write migration SQL that works with running code | Write migrations that break the app during deploy |
| Use parameterized queries (asyncpg `$1` syntax) | Concatenate user input into SQL strings |

## Production

Production uses systemd + Traefik. See [`deploy/README.md`](deploy/README.md) for the full setup guide.

```mermaid
graph LR
    A[Internet / LAN] --> B["Traefik :443
    TLS termination"]
    B --> C["FastAPI :8000"]
    C --> D["/api/* - REST API"]
    C --> E["/media/* - file serving"]
    C --> F["/* - frontend/dist/ (SPA)"]
```

- **systemd** manages the process (`Restart=always` for self-update restarts)
- **Traefik** handles TLS (Let's Encrypt DNS-01/Route53) and reverse proxying
- **FastAPI** serves both the API and the pre-built frontend (`frontend/dist/`)
- **Migrations** run automatically at startup via the FastAPI lifespan
- **Auto-update**: When `UPDATE_REPO` + GitHub App credentials are configured, the server checks for new GitHub Releases every 5 minutes and auto-applies updates (git checkout + frontend download + restart). Users see a non-invasive refresh banner.

Required env vars: `DATABASE_URL`, `MEDIA_ROOT_PATHS`, `GEMINI_API_KEY`. Optional: `UPDATE_REPO` + `GITHUB_APP_*` + `AUTO_UPDATE_INTERVAL` (enables automatic self-update via GitHub App).

## CI/CD

**PR checks** run automatically on every pull request:
- Title must follow [conventional commits](https://www.conventionalcommits.org/) format
- Scope, size, and version impact labels are applied automatically
- Dependencies are reviewed for known vulnerabilities
- Database migration changes are flagged for careful review
- [CodeQL](https://codeql.github.com/) scans Python + TypeScript for security issues

**CI** runs lint, typecheck, and tests on every PR and push to main. Jobs are skipped for unrelated changes (e.g., frontend-only PRs skip API tests).

All GitHub Actions are SHA-pinned. `.github/CODEOWNERS` requires review for CI/CD pipeline changes.

## Releasing

Releases are fully automated via [release-please](https://github.com/googleapis/release-please):

1. Merge PRs to `main` using conventional commits (`feat:`, `fix:`, etc.)
2. release-please automatically opens/updates a **Release PR** with the next version bump
3. The Release PR accumulates changes — review it to see what's pending
4. **Merge the Release PR** when ready to release (auto-merge is enabled — the PR will merge itself once CI passes, or you can merge manually)
5. On merge: release-please creates a git tag (`v0.1.0`) + GitHub Release, CI builds the frontend and uploads `frontend-dist.tar.gz`

Version bumping follows semver. While pre-1.0 (`bump-minor-pre-major` enabled): `feat:` → patch, `fix:` → patch, `feat!:` → minor. After 1.0: `feat:` → minor, `fix:` → patch, `feat!:` → major.
