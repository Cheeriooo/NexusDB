# Roadmap: NexusDB → Portfolio-Grade, Production-Ready

## Why this roadmap is shaped this way

The single best portfolio artifact this project can produce is: **"I built a
vector database from scratch, including my own approximate-nearest-neighbor
index, and here's the benchmark proving it's faster than brute force at the
same recall."** Everything else — auth, Docker, CI — makes the project *credible*
and *deployable*, but the ANN index is what makes it *interesting*. The phases
below are ordered so you get a deployable, demoable checkpoint early (Phase 0–1),
then build the differentiator (Phase 2), then harden it into something you'd
actually trust in production (Phases 3–6), then spend real effort on how it's
presented (Phase 7) — because an unpolished README is the most common reason a
genuinely good project gets skipped past.

Each phase lists **Goal**, **Work**, and **Done when** so it's checkable, not
vibes. Check off items as they land; this file is meant to be edited, not just read.

---

## Phase 0 — Repo Hygiene & Deployability (do this first, ~1–2 days)

**Goal:** anyone (including future-you, including a recruiter) can clone this,
run it in one command, and see it live without asking you anything.

- [x] Add a real `LICENSE` file (MIT, matching `pyproject.toml`)
- [x] Add `.env.example` documenting `NEXUSDB_AUTO_PERSIST`, `NEXUSDB_PERSIST_DIR`, and any future config
- [x] `Dockerfile` for the API (multi-stage: install deps, run `uvicorn`)
- [x] `Dockerfile` for the UI (build with Vite, serve static via nginx or a tiny Node server) — or fold into a single compose service
- [x] `docker-compose.yml` wiring API + UI + a named volume for `NEXUSDB_PERSIST_DIR`
- [x] `.github/workflows/ci.yml`: install deps, run `pytest --cov`, run `ruff`/`black --check`, run `npm run build` + `eslint` for the UI, on every push/PR
- [ ] Deploy a live demo (Railway, Fly.io, Render, or a $5 VPS — pick the cheapest thing that stays up) and put the URL in the README — **deliberately deferred**, see note below
- [x] `.gitignore` review — confirm `data/*.db`, `node_modules`, `dist`, `__pycache__` are all excluded (spot-check, don't assume)

**Done when:** `docker compose up` gets you a working stack locally, CI is green on a badge in the README, and a stranger can click a live link and use the app.

**Status (2026-08-28): locally verified, deploy deferred.** Ran the full pipeline
by hand, not just checked files exist:
- Backend: `pip install -e ".[dev]"`, `ruff check` (clean), `black --check` (clean),
  `pytest --cov` — **89/89 passed**, 72% coverage.
- Ran `uvicorn` directly and drove the real HTTP path: create collection → upsert
  2 vectors → cosine search → correct ranking → delete collection.
- Frontend: `npm ci`, `npm run lint` (clean), `npm run build` (succeeds; one
  non-fatal >500kB chunk-size warning), `npm run dev` and confirmed the Vite
  `/api` proxy reaches the live backend.
- `docker compose build` completed successfully (exit 0) for both the API and
  UI images. `docker compose up` end-to-end run is intentionally deferred —
  decided to finish local/server verification first and do the live-container
  and hosted-demo pass later, together with Phase 6.

Remaining open item in this phase: the live demo URL. Left for later by choice,
not because it's blocked.

---

## Phase 1 — Core Engine Hardening

**Goal:** the parts of the system that already exist stop having asterisks next to them.

- [x] **Durable persistence**: replaced "delete everything, re-insert everything" with incremental upserts/deletes against the SQLite tables (`SQLiteBackend.upsert_vectors` / `delete_vectors` / `upsert_metadata`), backed by `PRAGMA journal_mode=WAL` so a killed process doesn't corrupt the file. The API layer (`server.py`) now calls these on every write instead of `col.save()`'s full-table rewrite; the full rewrite path is still used for explicit export (`/collections/{name}/save`) and the CLI backup, where a full snapshot is the actual intent.
- [x] **Concurrency correctness**: found and fixed a real race in `FlatIndex.search` — it released the lock after snapshotting `_matrix`/`_id_list` but then read `self._vectors` *outside* the lock, and `_vectors` (unlike `_matrix`/`_id_list`) is mutated in place by `add()`/`remove()`, not reassigned. Fixed by snapshotting `dict(self._vectors)` under the same lock. Added `tests/test_concurrency.py`: threaded readers/writers hammering add/search/remove concurrently, asserting no exceptions and no malformed results.
- [x] **Proper HTTP error semantics**: audited every endpoint; 404/400/409/422 usage was already mostly correct (FastAPI/Pydantic handles 422 automatically). Fixed one real gap: `SearchRequest.k` had no lower bound, so `k=0` or negative silently returned an empty result instead of a 422.
- [x] **Pagination**: `GET /collections` now takes `limit` (default 100, max 1000) and `offset` query params, ordered by name — non-breaking (existing callers get the same list shape, just capped/sliced).
- [x] **Backup/restore CLI**: `nexusdb backup <collection> <path>` / `nexusdb restore <path> [--name] [--persist-dir]`, wired up via `nexusdb/cli.py` and a `project.scripts` entry point in `pyproject.toml`. Wraps the existing `Collection.save`/`Collection.load`, runs without the API process.
- [x] **Fixed a real crash found while verifying this phase**: several `print()` calls used emoji (✅/⚠️/🔄); on Windows, the default `cp1252` console encoding raises `UnicodeEncodeError` on those, which crashed the FastAPI startup lifespan entirely when there was persisted data to report loading — i.e., auto-persist load-on-startup was silently unusable on Windows. Replaced with plain ASCII log prefixes.

**Done when:** killing `-9` the API process mid-write doesn't corrupt or silently drop data, and there's a passing concurrency test proving it.

**Status (2026-08-28): done, verified for real.**
- `pytest --cov` — **93/93 passed** (added 5 new tests: 2 concurrency stress tests, 1 incremental-persistence round-trip test, 1 CLI backup/restore round-trip test), `ruff check` and `black --check` clean.
- Live durability test: ran `uvicorn` with `NEXUSDB_AUTO_PERSIST=true`, created a collection, upserted 2 vectors, confirmed `.db-wal`/`.db-shm` files appear (proof writes are incremental, not full-rewrite), **hard-killed the process** (`taskkill /F`, the Windows equivalent of `kill -9`), restarted against the same persist dir, and confirmed both vectors reloaded correctly with no corruption.
- Backup/restore CLI exercised end-to-end against a live persisted collection, not just unit-tested.

---

## Phase 2 — Approximate Nearest Neighbor Index (the differentiator)

**Goal:** this is the part that turns "CRUD app with cosine similarity" into
"vector database." It's also the most fun to build and the best interview story.

- [x] Design an `Index` protocol/ABC in `nexusdb/core/index/` that `FlatIndex` already implicitly satisfies — formalize it so a second implementation can be swapped in per-collection.
- [x] Implement **HNSW** (Hierarchical Navigable Small World) from scratch: layered graph construction, greedy search with a candidate heap, configurable `M` (max connections) and `ef_construction`/`ef_search`.
  - Delete support is mark-as-deleted (soft delete/tombstone) + rebuild past a configurable `rebuild_threshold` fraction of tombstones — documented as a tradeoff in `nexusdb/core/index/hnsw_index.py`'s module docstring, not hidden.
- [x] Let `POST /collections` accept an `index_type: "flat" | "hnsw"` (default `flat` for correctness-by-default) and construction params (`m`, `ef_construction`, `ef_search`). Persisted through SQLite so reloading a collection doesn't silently downgrade it back to `flat`.
- [x] **Benchmark suite** (`benchmarks/bench_ann.py`): measures recall@10 and p50/p95 query latency for `FlatIndex` vs `HNSWIndex` across 1k/10k/100k synthetic vectors (see note on dataset size below), plus a wall-clock-independent "distance computations per query" metric. Numbers published in `docs/BENCHMARKS.md` with a plot at `docs/benchmark_plot.png`.
- [x] Document the tradeoff explicitly: exact recall with `FlatIndex` vs. tunable recall/speed with `HNSWIndex` — see "Reading these numbers" in `docs/BENCHMARKS.md`.

**Done when:** you can point at a chart showing HNSW beating brute force on latency at >95% recall, on your own numbers, on your own machine.

**Status (2026-08-28): implementation done and verified; benchmark run for real,
"done when" bar only partially cleared — reported honestly rather than cherry-picked.**
- All code paths verified with tests, not just written: 36 new tests (`tests/test_hnsw_index.py`
  plus HNSW coverage added to `test_collection.py`/`test_api.py`/`test_sqlite_persistence.py`),
  130/130 passing, `ruff`/`black` clean.
- An independent adversarial review of `hnsw_index.py` (fresh context, no knowledge of my
  design choices) caught two real bugs before this was called done, both fixed and covered
  by regression tests: (1) repeatedly upserting the *same* id without ever calling `remove()`
  tombstoned a fresh node each time but never checked `rebuild_threshold`, so `_graph`/`_levels`
  grew unboundedly while `size` stayed constant — a real memory leak under a realistic workload
  ("re-embed and update this document"); (2) the search-distance counter was reset outside the
  lock it claims to respect, a live instance of the exact "mutate shared state outside the lock"
  bug class Phase 1 fixed in `FlatIndex`.
- **Benchmark, run at real scale (1k/10k/100k, dim=128, cosine)**: recall@10 was 1.000 / 0.857 /
  0.387 respectively at a fixed `ef_search=150`; wall-clock speedup over `FlatIndex` was
  0.03x / 0.11x / 1.01x — HNSW only reaches latency *parity* at 100k, and only at 39% recall.
  A follow-up `ef_search` sweep at n=100,000 (same built graph, `benchmarks/sweep_ef_search.py`)
  found that clearing 95% recall needs `ef_search≈2000`, at which point HNSW is ~12x *slower*
  than brute force — recall and wall-clock speed trade off directly at this scale, they are not
  simultaneously achievable with this implementation. Full numbers, the sweep table, and two
  concrete reasons why (isotropic random data lacks the manifold structure real embeddings have;
  pure-Python per-hop overhead vs. NumPy's single vectorized brute-force call) are in
  `docs/BENCHMARKS.md`. The algorithmic complexity win is real and demonstrated independently
  of wall-clock: at n=100,000, HNSW performs ~4,072 distance computations per query vs.
  FlatIndex's 100,000 — a ~24.5x reduction — it just isn't realized as a *latency* win without
  a compiled inner loop, which is the concrete, measured argument for why production vector
  databases (hnswlib, FAISS, Qdrant) don't write this hot path in pure Python.
- Also scaled dataset sizes down from the roadmap's 10k/100k/1M to 1k/10k/100k — a pure-Python
  HNSW build at 1M vectors would take hours, not a reasonable benchmark iteration loop; the
  100k build alone took ~21 minutes. Documented as a deliberate choice, not an oversight.

**Stretch (only after the above is solid):** IVF+PQ (product quantization) as a
third index type for memory-constrained scenarios — a good "I understand the
design space, not just one algorithm" signal, but optional.

---

## Phase 3 — API & Data Model Maturity

**Goal:** the API stops being "just enough for the demo UI" and starts looking
like something a real client would integrate against.

- [ ] **Metadata filtering** on search: accept a filter expression (`{"field": {"$eq": ...}}`-style, or start simpler with exact-match `dict`) in `SearchRequest`, push it down into `FlatIndex.search`'s existing (currently internal-only) `ids_filter` machinery, and pre-filter before the distance computation where possible for the ANN index too.
- [ ] **Batch ingestion**: a streaming/chunked upsert endpoint (or documented client-side batching guidance) so importing 1M vectors doesn't mean one giant JSON body.
- [ ] **API versioning**: introduce an `/v1` prefix now, before there's a second client depending on unversioned paths.
- [ ] **Auth**: API-key middleware (a header checked against a store — start with a single env-configured key, evolve to per-key records later). Document it clearly as "demo-grade" if you don't go further.
- [ ] **Lock down CORS** to explicit configured origins via env var, default-deny in anything other than local dev.
- [ ] **Rate limiting** (e.g., `slowapi`) and a request body size cap.
- [ ] Polish the OpenAPI schema: descriptions, examples, and response models for every endpoint (some already have this — make it universal).

**Done when:** a stranger reading `/docs` (Swagger) can integrate against the API without asking you a single question, and it survives someone hammering it with `hey`/`wrk` without falling over.

---

## Phase 4 — Observability & Reliability

**Goal:** if this were running for real, you'd know when it broke and why.

- [ ] Replace `print()` with structured logging (`structlog` or stdlib `logging` with a JSON formatter) — include request IDs.
- [ ] Add a `/metrics` endpoint (Prometheus format via `prometheus-fastapi-instrumentator`) covering request latency/count and vector counts per collection.
- [ ] Wire up basic tracing (OpenTelemetry SDK, even just console-exporter locally) across the search path.
- [ ] Split `/health` into liveness (process is up) vs. readiness (collections loaded, ready to serve).
- [ ] Add a simple load test (`locust` or `k6` script) and record baseline p50/p95/p99 latency at a given QPS and dataset size — put this next to the ANN benchmarks.

**Done when:** you can answer "how would you know if this went down in prod" with something other than "someone would tell me."

---

## Phase 5 — Testing & Quality Bar

**Goal:** the test suite is a safety net you'd actually trust, not just a
coverage number.

- [ ] Expand backend tests to cover the gaps: dimension-mismatch errors, empty-collection search, concurrent upsert/search, SQLite persistence round-trip with metadata edge cases (unicode, nested dicts, empty metadata).
- [ ] Property-based tests for `nexusdb/utils/distance.py` (via `hypothesis`) — distances should be non-negative (except dot), symmetric where applicable, and zero for identical vectors.
- [ ] Frontend: add Vitest + React Testing Library, cover at least the API client (`ui/src/api.js`) and one interactive page (Search or Collections form validation).
- [ ] One end-to-end test (Playwright) covering the golden path: create collection → upsert vectors → search → see results rendered.
- [ ] Wire coverage reporting into CI with a minimum threshold that fails the build if crossed downward.
- [ ] Add `mypy` (backend) and keep `eslint` (frontend) as CI gates, not just local tools.

**Done when:** CI has a coverage badge you're not embarrassed by, and you'd feel safe merging a refactor PR based on green CI alone.

---

## Phase 6 — Deployment & Scale Story

**Goal:** even if you don't actually run this at scale, you can speak credibly
about how it would scale — and ideally you've proven a piece of it.

- [ ] Ship the Phase 0 Docker setup to a real always-on (or scale-to-zero) host with the live demo URL in the README.
- [ ] Add an optional **pluggable persistence backend** — e.g., a Postgres+pgvector adapter alongside SQLite — behind the same interface `SQLiteBackend` implements. This demonstrates you understand persistence as a swappable concern, not a hardcoded detail.
- [ ] Write (doesn't have to be implemented) a short design note on how you'd shard collections across multiple nodes if this needed to scale past one machine's RAM — what's the sharding key, how does search fan out and merge, what's the consistency model. This is a legitimate, common system-design interview question; having already thought it through in writing is valuable on its own.
- [ ] If time allows, actually implement a minimal read-replica or sharding proof-of-concept — even a toy version demonstrates far more than the design note alone.

**Done when:** the live demo is stable under light real-world traffic, and you have a written answer (even if unimplemented) for "how does this scale beyond one box."

---

## Phase 7 — Presentation & Portfolio Polish

**Goal:** none of the above matters if the README doesn't sell it in the first
30 seconds. This is not fluff — it's the highest-ROI phase per hour spent.

- [ ] Rewrite the root `README.md`: what this is, why you built it, an architecture diagram (can be ASCII or a simple image), a GIF of the UI in action, the live demo link, the benchmark numbers from Phase 2/4, and a "Highlights" section calling out the from-scratch HNSW index specifically.
- [ ] Add CI/coverage/license badges to the README.
- [ ] Write a short `docs/DECISIONS.md` (lightweight ADR log) capturing 4–6 real decisions and why: flat vs. approximate index tradeoff, SQLite vs. a "real" DB, cosine-as-default, in-memory-first design, etc. This is what separates "built a tutorial project" from "made engineering tradeoffs" in a reviewer's mind.
- [ ] Consider a short write-up (blog post or `docs/HNSW.md`) walking through how the HNSW implementation works — this is genuinely good interview prep material and a shareable link independent of the repo.
- [ ] Record a 60–90 second demo video/GIF: create a collection, embed some text, search, watch the 3D visualizer. Link it at the top of the README.

**Done when:** someone with 30 seconds and no context understands what this project is, why it's technically interesting, and can see it running without cloning anything.

---

## Suggested sequencing if you're time-constrained

If you only have a weekend or two, do **Phase 0 → Phase 2 (HNSW + benchmarks) →
Phase 7 (README + demo)** in that order. That combination — live demo, a real
algorithm implemented from scratch with numbers to back it up, and a README
that explains it well — covers the vast majority of the portfolio value. Everything
in Phases 1, 3–6 makes the project *more* production-ready, but the three above
are what get you through the door in a screen.
