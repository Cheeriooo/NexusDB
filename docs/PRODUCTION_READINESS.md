# Production Readiness Checklist

A cross-cutting checklist, independent of the phased roadmap, for "is this
actually production-ready" — the kind of list an interviewer or a senior
engineer doing code review would run through. Status reflects the codebase as
of this writing; update it as items land.

Legend: ✅ done · 🟡 partial · ❌ missing

## Correctness & Data Integrity

| Item | Status | Notes |
|---|---|---|
| Input validation on all endpoints | 🟡 | Pydantic covers shape/types; dimension/metric mismatches return 400 |
| Durable writes (crash-safe persistence) | ❌ | Full-table rewrite per save, no WAL, off by default |
| Backup / restore story | ❌ | No documented or automated backup path |
| Data migration story (schema changes) | ❌ | SQLite schema has no version column |
| Idempotent upsert | ✅ | Upsert-by-id is idempotent by construction |

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

## Observability

| Item | Status | Notes |
|---|---|---|
| Structured logging | ❌ | `print()` statements only |
| Metrics (Prometheus/OpenTelemetry) | ❌ | None |
| Distributed tracing | ❌ | None |
| Error tracking (Sentry or similar) | ❌ | None |
| Alerting | ❌ | N/A without metrics |

## Testing & CI

| Item | Status | Notes |
|---|---|---|
| Backend unit tests | ✅ | `tests/` covers api, collection, distance, flat_index, sqlite_persistence, vector |
| Coverage measured/enforced | 🟡 | `pytest-cov` is a dependency; no CI to run or gate on it |
| Frontend tests | ❌ | No Vitest/RTL setup in `ui/` |
| End-to-end tests | ❌ | None |
| CI pipeline | ❌ | No `.github/workflows` |
| Lint/format enforced in CI | ❌ | `eslint.config.js` exists for the UI but isn't run in CI; no Python linter configured |
| Type checking | 🟡 | Python uses type hints throughout; no `mypy`/`pyright` run |

## Deployment & Ops

| Item | Status | Notes |
|---|---|---|
| Containerized (Docker) | ❌ | No Dockerfile |
| One-command local dev | 🟡 | `pip install -e .` + `npm install` works but isn't scripted/documented end-to-end |
| Deployed demo (live URL) | ❌ | This matters more than almost anything else for a portfolio piece |
| Environment-based config | 🟡 | `NEXUSDB_AUTO_PERSIST` / `NEXUSDB_PERSIST_DIR` exist; no `.env.example`, no config doc |
| Reverse proxy / TLS story | ❌ | Not applicable locally; needs a plan for deployment |

## Documentation & Project Hygiene

| Item | Status | Notes |
|---|---|---|
| README with problem statement, architecture, demo link | 🟡 | README currently one line — biggest single portfolio-impact gap |
| LICENSE file | ❌ | `pyproject.toml` claims MIT but no `LICENSE` file exists |
| CONTRIBUTING.md | ❌ | None |
| Architecture docs | ✅ | `docs/ARCHITECTURE.md` (this doc set) |
| API docs | 🟡 | FastAPI auto-generates `/docs`; `docs/API_REFERENCE.md` adds a map |
| Changelog | ❌ | None |

## How to use this doc

Don't try to check every box before doing anything else — that's how side
projects die. Use [ROADMAP.md](./ROADMAP.md) to sequence the work; use this
checklist to sanity-check "am I actually done with Phase N" and to answer
"is this production-ready" honestly in an interview instead of guessing.
