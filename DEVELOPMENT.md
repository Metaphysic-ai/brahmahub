# Development Guide

This guide covers everything you need to contribute to BrahmaHub — from initial setup through making your first PR. If you're new to the project or to any of the tools we use, the [Resources](#resources) section at the bottom has helpful links.

> [!NOTE]
> For project overview, architecture, and environment variables, see the [README](README.md).
> For production deployment, see [`deploy/README.md`](deploy/README.md).

---

## Prerequisites

| Dependency | Version | What for |
| ---------- | ------- | -------- |
| [mise](https://mise.jdx.dev/) | 2026.2+ | Runtime & task manager (installs everything else) |
| PostgreSQL | 16+ | Database |
| ffmpeg + ffprobe | 5.x+ | Media processing (proxy/thumbnail generation) |

mise automatically manages Python 3.12, Node 24, pnpm, uv, ruff, ty, and lefthook — you should never need to install these manually.

---

## Setup

```bash
# 1. Install mise (if not already installed)
curl https://mise.jdx.dev/install.sh | sh

# 2. Clone and enter
git clone https://github.com/Metaphysic-ai/brahmahub.git
cd brahmahub

# 3. Trust mise config and bootstrap
#    Creates .env, PostgreSQL role + database, installs all deps + git hooks
mise trust
mise run setup

# 4. Edit .env — set at minimum:
#    MEDIA_ROOT_PATHS=/mnt/data,/mnt/x
#    GEMINI_API_KEY=your-key-here

# 5. Start everything (DB check + migrations + API :8000 + Frontend :8080)
mise run dev
```

> [!NOTE]
> Setup assumes the PostgreSQL superuser password is `postgres`. Override with `PGPASSWORD=yourpass mise run setup`.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| API | http://localhost:8000/api |
| API docs (Swagger) | http://localhost:8000/docs |

---

## Commands

| Task | Description |
| ---- | ----------- |
| `mise run setup` | First-time bootstrap: tools, deps, hooks, .env, database |
| `mise run dev` | Start everything (migrate + API + frontend) |
| `mise run stop` | Stop API + frontend |
| `mise run status` | Show what's running (DB, API, frontend) |
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

---

## Toolchain

Once you have the [prerequisites](#prerequisites) installed, `mise run setup` installs everything else automatically. This is just so you know what's running under the hood.

| Tool | What it does | You'll interact with it when... |
| ---- | ------------ | ------------------------------- |
| [uv](https://docs.astral.sh/uv/) | Manages Python packages (like pip, but faster) | Adding a Python dependency (`uv add package`) |
| [pnpm](https://pnpm.io/) | Manages Node.js packages (like npm, but faster) | Adding a frontend dependency (`cd frontend && pnpm add package`) |
| [ruff](https://docs.astral.sh/ruff/) | Lints + formats Python code | A lint error blocks your commit — `mise run fix` resolves most |
| [ty](https://docs.astral.sh/ty/) | Type checks Python code | A type error blocks your push |
| [biome](https://biomejs.dev/) | Lints + formats TypeScript/React code | Same as ruff, but for frontend code |
| [lefthook](https://github.com/evilmartians/lefthook) | Runs checks on commit/push automatically | You don't — it runs in the background via git hooks |

Also useful but not required for day-to-day development:

| Tool | What it does |
| ---- | ------------ |
| [GitHub CLI (`gh`)](https://cli.github.com/) | Create PRs, check CI status, manage releases from the terminal |

> [!IMPORTANT]
> Never run `pip`, `npm`, or `yarn` directly. Use `uv` for Python deps and `pnpm` for Node deps, both managed through mise.

---

## Migrations

Create a new `.sql` file in `db/migrations/` with the next number prefix:

```bash
# Example: db/migrations/002_add_tags_column.sql
mise run migrate
```

Migrations run automatically on app startup in production — you do not need to deploy them separately.

**Reset the database:**

```bash
dropdb ingesthub && createdb ingesthub
mise run migrate
```

---

## Git Hooks

Lefthook runs automatically — you do not need to remember to lint or format manually.

| Hook | When | What it does |
|------|------|-------------|
| **pre-commit** | Every commit | Auto-formats staged files (ruff + biome) |
| **commit-msg** | Every commit | Validates conventional commit format |
| **pre-push** | Every push | Runs full lint + typecheck + tests |

If a hook fails, your commit or push is blocked until you fix the issue.

> [!TIP]
> **Hook failing?** Run `mise run fix` — it auto-fixes most lint/format issues. Then re-stage your files (`git add`) and try the commit again. If the *pre-push* hook fails on tests, run `mise run test` to see the full error output.

Hooks are installed by `mise run setup`. If they stop working: `lefthook install`.

---

## Commit Messages

Every commit message **must** follow [conventional commits](https://www.conventionalcommits.org/) format. This is enforced by a git hook locally and by CI on PR titles.

**Why?** Conventional commits aren't just a style choice — they directly control versioning and changelogs. When you write `feat:`, release-please knows to bump the version. When you write `fix:`, it creates a patch release. The changelog is generated automatically from your commit messages, so clear messages = clear release notes for the team.

**Format:** `type(scope): description`

- **type** — what kind of change (see table below)
- **scope** — which part of the codebase (optional but recommended)
- **description** — what you did, in lowercase imperative mood ("add feature" not "Added feature"), no trailing period

> [!TIP]
> Think of the description as completing the sentence: "This commit will ___". For example: "add bulk delete endpoint", "fix crash on empty grid", "extract validation into service".

### Types

| Type | When to use | Release effect |
|------|-------------|----------------|
| `feat` | New functionality visible to users | Version bump (patch pre-1.0, minor after) |
| `fix` | Bug fix | Patch bump |
| `perf` | Performance improvement | No release (appears in changelog) |
| `docs` | Documentation only | No release |
| `style` | Formatting, whitespace, semicolons | No release |
| `refactor` | Code change that doesn't fix a bug or add a feature | No release |
| `test` | Adding or updating tests | No release |
| `build` | Build system or external dependencies | No release |
| `ci` | CI configuration changes | No release |
| `chore` | Maintenance tasks | No release |
| `revert` | Revert a previous commit | No release |

### Scopes

Indicate which part of the codebase is affected: `api`, `frontend`, `cli`, `db`, `deploy`

### Breaking Changes

Add `!` after the type to signal a breaking change: `feat(api)!: change asset response format`

### Examples

```bash
# Good
git commit -m "feat(api): add bulk delete endpoint for packages"
git commit -m "fix(frontend): prevent crash on empty asset grid"
git commit -m "refactor(api): extract validation into service layer"
git commit -m "docs: update deployment guide"
git commit -m "feat(api)!: change asset response format"  # breaking change

# Bad — rejected by the commit hook
git commit -m "fixed the bug"              # no type prefix
git commit -m "update stuff"               # no type prefix

# Accepted but avoid — prefer lowercase, no trailing period
git commit -m "feat: Added new Feature."
```

---

## Pull Requests

1. **Create a branch** from `main` and make your changes
2. **Push and open a PR** — the PR title must follow conventional commit format (same rules as commit messages). The title determines the changelog entry and version impact label.
3. **CI runs automatically** — jobs are path-filtered, so frontend-only PRs skip API tests and vice versa. This is expected, not an error.
4. **Get a review and merge** — merge commit or rebase (squash is disabled)

### PR Checks

| Check | What it does | Blocks merge? |
|-------|-------------|---------------|
| **CI** (lint, typecheck, tests) | Runs relevant checks based on which files changed | Yes |
| **PR Title** | Validates conventional commit format | Yes |
| **Dependency review** | Flags new dependencies with known vulnerabilities | Yes (high/critical) |
| **CodeQL** | Static security analysis for Python + TypeScript | No (informational) |
| **Labels** | Auto-applies scope, size, and version impact labels | No |
| **Migration warning** | Comments if `db/migrations/` files are changed | No |

> [!NOTE]
> Version impact labels (`minor`, `patch`, etc.) reflect standard semver intent. While pre-1.0, the actual release bump is smaller than the label suggests (see [Releasing](#releasing)).

---

## Do's and Don'ts

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

---

## Releasing

Releases are fully automated via [release-please](https://github.com/googleapis/release-please):

1. Merge PRs to `main` using conventional commits (`feat:`, `fix:`, etc.)
2. release-please automatically opens/updates a **Release PR** with the next version bump and changelog
3. The Release PR accumulates changes — review it to see what's pending
4. The Release PR auto-merges once CI passes (via the [`brahmahub-release`](README.md#github-apps) app), or you can merge it manually
5. On merge: release-please creates a git tag (`v0.1.0`) + GitHub Release, CI builds the frontend and uploads `frontend-dist.tar.gz`

### Version Bumps

Version bumping follows semver. While pre-1.0 (`bump-minor-pre-major` enabled):

| Commit | Pre-1.0 bump | Post-1.0 bump |
|--------|-------------|---------------|
| `feat:` | patch | minor |
| `fix:` | patch | patch |
| `feat!:` | minor | major |

---

## CI/CD

All workflows live in `.github/workflows/`. Actions are SHA-pinned for supply chain security. `.github/CODEOWNERS` requires review for CI/CD pipeline changes.

**CI** (`ci.yml` → `checks.yml`) runs on every PR and push to main:
- Lint, typecheck, and tests — path-filtered so unrelated jobs are skipped
- A `gate` job aggregates all results for branch protection

**PR automation** (`pr.yml`):
- Title validation (conventional commits)
- Scope, size, and version impact labels
- Dependency review (blocks on high/critical vulnerabilities)
- Migration change warnings

**CodeQL** (`codeql.yml`):
- Static security analysis for Python + TypeScript
- Runs on PRs, pushes to main, and weekly

**Release** (`release.yml`):
- Triggered on push to main
- release-please manages the Release PR, git-cliff generates the changelog
- On Release PR merge: builds frontend, uploads artifact to GitHub Release

---

## When Things Go Wrong

| Problem | Fix |
|---------|-----|
| `mise run setup` fails on database | Check PostgreSQL is running: `pg_isready`. Override password: `PGPASSWORD=yourpass mise run setup` |
| Pre-commit hook rejects your commit | Run `mise run fix`, re-stage files (`git add`), commit again |
| Pre-push hook fails on tests | Run `mise run test` locally to see the full error |
| `mise run dev` says port in use | Run `mise run stop` first, or check `lsof -i :8000` / `lsof -i :8080` |
| Frontend shows stale UI after pulling | `cd frontend && pnpm install` then restart dev server |
| Python import errors after pulling | `uv sync` to install any new dependencies |
| Migration fails | Check the SQL syntax, fix the file, drop + recreate DB if needed (see [Migrations](#migrations)) |

---

## Resources

New to some of these tools or concepts? These are worth a read:

| Topic | Link |
|-------|------|
| Conventional Commits spec | https://www.conventionalcommits.org/ |
| Conventional Commits cheat sheet | https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13 |
| mise getting started | https://mise.jdx.dev/getting-started.html |
| GitHub CLI manual | https://cli.github.com/manual/ |
| FastAPI tutorial | https://fastapi.tiangolo.com/tutorial/ |
| TanStack Query (React) | https://tanstack.com/query/latest/docs/framework/react/overview |
| shadcn/ui components | https://ui.shadcn.com/ |
| asyncpg (PostgreSQL driver) | https://magicstack.github.io/asyncpg/current/ |
