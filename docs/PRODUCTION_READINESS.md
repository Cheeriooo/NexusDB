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
| Authentication | 🟡 | `X-API-Key` against `NEXUSDB_API_KEY` on all `/v1` routes (Phase 3); demo-grade — one shared key, not per-key records, off unless the env var is set |
| Authorization / multi-tenancy | ❌ | Any client with the (single, shared) API key can read/write any collection |
| CORS locked to known origins | ✅ | `NEXUSDB_CORS_ORIGINS` allow-list (default: the Vite dev server only), replaces the old `allow_origins=["*"]` (Phase 3) |
| Secrets management | 🟡 | `.env.example` documents every secret-shaped var (`NEXUSDB_API_KEY`); no vault/rotation story, fine for this project's scale |
| Dependency vulnerability scanning | ❌ | No `pip-audit` / `npm audit` / Dependabot config |
| Rate limiting / abuse protection | ✅ | `NEXUSDB_RATE_LIMIT` (default `120/minute` per client IP) — **shipped broken in Phase 3** (a complete no-op on every `/v1` route due to a `slowapi`/FastAPI routing incompatibility — see `docs/BENCHMARKS.md`) and **fixed in Phase 4** with a custom `RateLimitMiddleware`, verified live (120 allowed then 429s) and covered by a regression test that didn't exist before |
| Input size limits (payload/body caps) | ✅ | `NEXUSDB_MAX_BODY_SIZE` (default 50 MiB), enforced by streaming byte count (catches chunked bodies too), verified live with a 413 |

## Reliability & Scaling

| Item | Status | Notes |
|---|---|---|
| Horizontal scalability | ❌ | Single process, in-process dict is the source of truth |
| Graceful shutdown | 🟡 | `shutdown_event` saves collections if auto-persist is on; no in-flight request draining |
| Health checks | ✅ | `/health/live` (liveness — always 200 once serving) and `/health/ready` (readiness — 503 until persisted collections finish loading) added in Phase 4 alongside the original combined `/health`, kept for backwards compatibility |
| Load/perf testing | ✅ | `benchmarks/load_test.py` (Locust), run for real in Phase 4: 20 concurrent users, 5:1 search:upsert mix, 60s — 5,853 requests, 0 failures, p50 30ms / p95 150ms / p99 220ms. One baseline data point, not a capacity ceiling — see `docs/BENCHMARKS.md` |
| Resource limits documented (memory per N vectors) | ❌ | Not measured or written down |
| Pagination on list endpoints | ✅ | `GET /collections` supports `limit`/`offset` (default 100, max 1000) |

## Observability

| Item | Status | Notes |
|---|---|---|
| Structured logging | ✅ | JSON logs (`nexusdb/observability/logging.py`) with a per-request `request_id` (`ContextVar`-backed) tying together the access-log line and every log line emitted while handling that request; `NEXUSDB_LOG_FORMAT=text` for local reading. All `print()` calls in the API layer replaced (Phase 4) |
| Metrics (Prometheus/OpenTelemetry) | ✅ | `GET /metrics`: request count/latency from `prometheus-fastapi-instrumentator`, plus `nexusdb_collection_vectors`/`nexusdb_collections_total` from a custom live-scrape `Collector` (Phase 4) |
| Distributed tracing | 🟡 | OpenTelemetry spans across the search path (`search_vectors` → `collection.search`, with collection/k/index_type/result-count attributes), `ConsoleSpanExporter` only — off by default (`NEXUSDB_TRACING_ENABLED`) to avoid spamming every test/CI run; swapping in a real OTLP exporter is a one-line change, not done (Phase 4) |
| Error tracking (Sentry or similar) | ❌ | None |
| Alerting | ❌ | N/A without a metrics backend actually scraping `/metrics` (the endpoint exists; nothing is wired to consume it yet) |

## Testing & CI

| Item | Status | Notes |
|---|---|---|
| Backend unit tests | ✅ | `tests/` covers api, collection, distance, flat_index, hnsw_index, concurrency, sqlite_persistence, vector — 154 tests, verified passing locally 2026-08-31 |
| Coverage measured/enforced | 🟡 | `pytest --cov` runs in CI (80% total); no minimum-threshold gate yet |
| Frontend tests | ❌ | No Vitest/RTL setup in `ui/` |
| End-to-end tests | ❌ | None |
| CI pipeline | ✅ | `.github/workflows/ci.yml`: backend (ruff/black/pytest), frontend (eslint/build), docker build jobs |
| Lint/format enforced in CI | ✅ | `ruff`/`black --check` (backend) and `eslint` (frontend) both run in CI; verified clean locally |
| Type checking | 🟡 | Python uses type hints throughout; no `mypy`/`pyright` run |

## Deployment & Ops

| Item | Status | Notes |
|---|---|---|
| Containerized (Docker) | ✅ | Root `Dockerfile` (API) + `ui/Dockerfile` (nginx) + `docker-compose.yml`; `docker compose build` verified successful 2026-08-28. `HEALTHCHECK` switched to `/health/live` in Phase 4 — not re-verified with a fresh `docker build` after that change or the new observability deps, worth doing before Phase 6 |
| One-command local dev | ✅ | `docker compose up` (once verified end-to-end) or `pip install -e ".[dev]"` + `npm ci` — both paths confirmed working locally |
| Deployed demo (live URL) | ❌ | Deliberately deferred — doing local/server verification first, live demo bundled with Phase 6 |
| Environment-based config | ✅ | `.env.example` documents `NEXUSDB_AUTO_PERSIST` / `NEXUSDB_PERSIST_DIR`, auth/CORS/rate-limit vars, the Phase 4 observability vars (`NEXUSDB_LOG_LEVEL`/`FORMAT`, `NEXUSDB_TRACING_ENABLED`), and UI's `VITE_API_BASE` |
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
