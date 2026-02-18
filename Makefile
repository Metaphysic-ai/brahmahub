.PHONY: help db db-stop db-logs db-shell migrate api api-pip frontend frontend-install dev stop status test test-fe lint typecheck

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Helpers ────────────────────────────────────────────────────

# Internal target: ensure postgres is running and healthy
.PHONY: _ensure-db
_ensure-db:
	@if ! docker compose ps postgres --format '{{.Status}}' 2>/dev/null | grep -q 'Up'; then \
		echo "Starting PostgreSQL..."; \
		docker compose up -d postgres; \
		echo "Waiting for healthy..."; \
		for i in 1 2 3 4 5 6 7 8 9 10; do \
			docker compose exec postgres pg_isready -U ingesthub -d ingesthub >/dev/null 2>&1 && break; \
			sleep 1; \
		done; \
		echo "PostgreSQL is ready on :5432"; \
	fi

# Internal target: ensure .venv exists and deps are installed
.PHONY: _ensure-venv
_ensure-venv:
	@if [ ! -d .venv ]; then \
		echo "Creating Python virtual environment..."; \
		python3 -m venv .venv; \
	fi
	@if [ ! -f .venv/.deps-installed ] || [ api/requirements.txt -nt .venv/.deps-installed ]; then \
		echo "Installing API dependencies..."; \
		.venv/bin/pip install -q -r api/requirements.txt; \
		touch .venv/.deps-installed; \
	fi

# Internal target: ensure frontend deps are installed
.PHONY: _ensure-frontend
_ensure-frontend:
	@if [ ! -d frontend/node_modules ] || [ frontend/package.json -nt frontend/node_modules/.package-lock.json ]; then \
		echo "Installing frontend dependencies..."; \
		cd frontend && npm install; \
	fi

# ── Database ──────────────────────────────────────────────────

db: ## Start PostgreSQL (Docker)
	@$(MAKE) _ensure-db

db-stop: ## Stop PostgreSQL
	docker compose stop postgres

db-logs: ## Tail PostgreSQL logs
	docker compose logs -f postgres

db-shell: _ensure-db ## Open psql shell
	docker compose exec postgres psql -U ingesthub -d ingesthub

migrate: _ensure-db ## Run new SQL migrations (tracked)
	@docker compose exec -T postgres psql -q -U ingesthub -d ingesthub -c \
		"CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());"
	@for f in db/migrations/*.sql; do \
		fn=$$(basename "$$f"); \
		already=$$(docker compose exec -T postgres psql -qtAX -U ingesthub -d ingesthub -c \
			"SELECT 1 FROM _migrations WHERE filename = '$$fn'"); \
		if [ -z "$$already" ]; then \
			echo "Applying $$fn ..."; \
			output=$$(docker compose exec -T postgres psql -q -U ingesthub -d ingesthub \
				-v ON_ERROR_STOP=1 -f "/docker-entrypoint-initdb.d/$$fn" 2>&1); \
			rc=$$?; \
			echo "$$output" | grep -v '^psql.*NOTICE:' || true; \
			if [ $$rc -eq 0 ]; then \
				docker compose exec -T postgres psql -q -U ingesthub -d ingesthub -c \
					"INSERT INTO _migrations (filename) VALUES ('$$fn');"; \
			else \
				echo "  FAILED: $$fn (not recorded — will retry next run)"; \
			fi; \
		fi; \
	done
	@echo "All migrations applied."

# ── API ───────────────────────────────────────────────────────

api-pip: ## Install API Python dependencies into .venv
	@$(MAKE) _ensure-venv

api: _ensure-db _ensure-venv ## Start FastAPI dev server (:8000)
	.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude 'frontend/*'

# ── Frontend ──────────────────────────────────────────────────

frontend-install: ## Install frontend dependencies
	@$(MAKE) _ensure-frontend

frontend: _ensure-frontend ## Start Vite dev server (:8080)
	cd frontend && npx vite

typecheck: _ensure-frontend ## Run TypeScript type check
	cd frontend && npx tsc --noEmit

# ── Combo ─────────────────────────────────────────────────────

dev: ## Start DB + migrate + API + Frontend
	@$(MAKE) _ensure-db
	@$(MAKE) migrate
	@$(MAKE) _ensure-venv
	@$(MAKE) _ensure-frontend
	@echo "Starting API..."
	@.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude 'frontend/*' &
	@echo "Starting Frontend..."
	@cd frontend && npx vite &
	@echo ""
	@echo "  API:      http://localhost:8000/api"
	@echo "  Frontend: http://localhost:8080"
	@echo ""
	@echo "Press Ctrl+C to stop API & Frontend (then 'make stop' for everything)"

stop: ## Stop everything (DB + API + Frontend)
	@-pkill -f "uvicorn api.main:app" 2>/dev/null && echo "API stopped" || echo "API not running"
	@-pkill -f "vite" 2>/dev/null && echo "Frontend stopped" || echo "Frontend not running"
	@$(MAKE) db-stop

# ── Quality ───────────────────────────────────────────────────

status: ## Show status of DB, API, Frontend
	@echo "── PostgreSQL ──"
	@docker compose ps postgres 2>/dev/null || echo "  Not running"
	@echo ""
	@echo "── API (:8000) ──"
	@curl -s http://localhost:8000/api/health >/dev/null 2>&1 && echo "  Running" || echo "  Not running"
	@echo ""
	@echo "── Frontend (:8080) ──"
	@curl -s http://localhost:8080 >/dev/null 2>&1 && echo "  Running" || echo "  Not running"

test: test-api test-fe ## Run all tests

test-api: _ensure-venv _ensure-db ## Run API tests
	.venv/bin/pytest tests/ -v

test-fe: _ensure-frontend ## Run frontend tests
	cd frontend && npm test

lint: _ensure-frontend ## Lint frontend
	cd frontend && npm run lint
