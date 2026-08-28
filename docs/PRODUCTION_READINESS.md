# Production Readiness Checklist

A cross-cutting checklist, independent of the phased roadmap, for "is this
actually production-ready" — the kind of list an interviewer or a senior
engineer doing code review would run through. Status reflects the codebase as
of this writing; update it as items land.

Legend: ✅ done · 🟡 partial · ❌ missing

## Correctness & Data Integrity

| Item | Status | Notes |
|---|---|---|
| Input validation on all endpoints | 🟡 | Pydantic covers shape/types; dimension/metric mismatches return 400; `k<=0` now rejected with 422 |
| Durable writes (crash-safe persistence) | ✅ | Incremental upsert/delete against SQLite + `PRAGMA journal_mode=WAL`; verified with a hard `taskkill /F` mid-session — data survived intact. Still off by default (`NEXUSDB_AUTO_PERSIST`) |
| Backup / restore story | ✅ | `nexusdb backup <collection> <path>` / `nexusdb restore <path>` CLI, exercised end-to-end against a live persisted collection |
| Data migration story (schema changes) | ❌ | SQLite schema has no version column |
| Idempotent upsert | ✅ | Upsert-by-id is idempotent by construction |
| Concurrency correctness | ✅ | Fixed a real race in `FlatIndex.search` (read `_vectors` outside the lock after snapshotting `_matrix`); covered by a threaded stress test |

## Security

| Item | Status | Notes |
|---|---|---|
| Authentication | ❌ | No API keys, no auth middleware |
| Authorization / multi-tenancy | ❌ | Any client can read/write any collection |
| CORS locked to known origins | ❌ | `allow_origins=["*"]` |
| Secrets management | ❌ | No `.env.example`, no secrets in play yet — plan before adding any (DB creds, API keys) |
| Dependency vulnerability scanning | ❌ | No `pip-audit` / `npm audit` / Dependabot config |
| Rate limiting / abuse protection | ❌ | None |
| Input size limits (payload/body caps) | ❌ | Unbounded upsert batch size |

## Reliability & Scaling

| Item | Status | Notes |
|---|---|---|
| Horizontal scalability | ❌ | Single process, in-process dict is the source of truth |
| Graceful shutdown | 🟡 | `shutdown_event` saves collections if auto-persist is on; no in-flight request draining |
| Health checks | 🟡 | `/health` exists; no separate readiness vs. liveness semantics |
| Load/perf testing | ❌ | No benchmark numbers published anywhere |
| Resource limits documented (memory per N vectors) | ❌ | Not measured or written down |
| Pagination on list endpoints | ✅ | `GET /collections` supports `limit`/`offset` (default 100, max 1000) |

## Observability

| Item | Status | Notes |
|---|---|---|
| Structured logging | ❌ | `print()` statements only (emoji removed 2026-08-28 — they crashed FastAPI startup on Windows via `cp1252`; still not structured/leveled, that's Phase 4) |
| Metrics (Prometheus/OpenTelemetry) | ❌ | None |
| Distributed tracing | ❌ | None |
| Error tracking (Sentry or similar) | ❌ | None |
| Alerting | ❌ | N/A without metrics |

## Testing & CI

| Item | Status | Notes |
|---|---|---|
| Backend unit tests | ✅ | `tests/` covers api, collection, distance, flat_index, sqlite_persistence, vector — 89 tests, verified passing locally 2026-08-28 |
| Coverage measured/enforced | 🟡 | `pytest --cov` runs in CI (72% total); no minimum-threshold gate yet |
| Frontend tests | ❌ | No Vitest/RTL setup in `ui/` |
| End-to-end tests | ❌ | None |
| CI pipeline | ✅ | `.github/workflows/ci.yml`: backend (ruff/black/pytest), frontend (eslint/build), docker build jobs |
| Lint/format enforced in CI | ✅ | `ruff`/`black --check` (backend) and `eslint` (frontend) both run in CI; verified clean locally |
| Type checking | 🟡 | Python uses type hints throughout; no `mypy`/`pyright` run |

## Deployment & Ops

| Item | Status | Notes |
|---|---|---|
| Containerized (Docker) | ✅ | Root `Dockerfile` (API) + `ui/Dockerfile` (nginx) + `docker-compose.yml`; `docker compose build` verified successful 2026-08-28, `up` end-to-end pass still pending |
| One-command local dev | ✅ | `docker compose up` (once verified end-to-end) or `pip install -e ".[dev]"` + `npm ci` — both paths confirmed working locally |
| Deployed demo (live URL) | ❌ | Deliberately deferred — doing local/server verification first, live demo bundled with Phase 6 |
| Environment-based config | ✅ | `.env.example` documents `NEXUSDB_AUTO_PERSIST` / `NEXUSDB_PERSIST_DIR` and UI's `VITE_API_BASE` |
| Reverse proxy / TLS story | ❌ | Not applicable locally; needs a plan for deployment |

## Documentation & Project Hygiene

| Item | Status | Notes |
|---|---|---|
| README with problem statement, architecture, demo link | 🟡 | Still needs the Phase 7 rewrite (architecture diagram, GIF, benchmark numbers, demo link) |
| LICENSE file | ✅ | MIT `LICENSE` present, matches `pyproject.toml` |
| CONTRIBUTING.md | ❌ | None |
| Architecture docs | ✅ | `docs/ARCHITECTURE.md` (this doc set) |
| API docs | 🟡 | FastAPI auto-generates `/docs`; `docs/API_REFERENCE.md` adds a map |
| Changelog | ❌ | None |

## How to use this doc

Don't try to check every box before doing anything else — that's how side
projects die. Use [ROADMAP.md](./ROADMAP.md) to sequence the work; use this
checklist to sanity-check "am I actually done with Phase N" and to answer
"is this production-ready" honestly in an interview instead of guessing.
