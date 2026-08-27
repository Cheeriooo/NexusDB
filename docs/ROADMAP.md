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

- [ ] Add a real `LICENSE` file (MIT, matching `pyproject.toml`)
- [ ] Add `.env.example` documenting `NEXUSDB_AUTO_PERSIST`, `NEXUSDB_PERSIST_DIR`, and any future config
- [ ] `Dockerfile` for the API (multi-stage: install deps, run `uvicorn`)
- [ ] `Dockerfile` for the UI (build with Vite, serve static via nginx or a tiny Node server) — or fold into a single compose service
- [ ] `docker-compose.yml` wiring API + UI + a named volume for `NEXUSDB_PERSIST_DIR`
- [ ] `.github/workflows/ci.yml`: install deps, run `pytest --cov`, run `ruff`/`black --check`, run `npm run build` + `eslint` for the UI, on every push/PR
- [ ] Deploy a live demo (Railway, Fly.io, Render, or a $5 VPS — pick the cheapest thing that stays up) and put the URL in the README
- [ ] `.gitignore` review — confirm `data/*.db`, `node_modules`, `dist`, `__pycache__` are all excluded (spot-check, don't assume)

**Done when:** `docker compose up` gets you a working stack locally, CI is green on a badge in the README, and a stranger can click a live link and use the app.

---

## Phase 1 — Core Engine Hardening

**Goal:** the parts of the system that already exist stop having asterisks next to them.

- [ ] **Durable persistence**: replace "delete everything, re-insert everything" in `SQLiteBackend.save_collection` with either (a) incremental upserts/deletes against the SQLite tables, or (b) an append-only WAL that's compacted periodically. Either is a legitimate systems-design story to tell in an interview; the current approach is not.
- [ ] **Concurrency correctness**: `FlatIndex` and `Collection` each hold their own `threading.Lock`; audit for races (e.g., a search reading `_matrix` while `_rebuild_matrix` is mid-flight under concurrent requests) and write a concurrency stress test (`pytest-xdist` or a threaded test) that would have caught them.
- [ ] **Proper HTTP error semantics**: audit every endpoint for correct status codes (404 vs 400 vs 422 vs 409) and consistent error body shape.
- [ ] **Pagination**: `GET /collections` and any future "list vectors" endpoint should support `limit`/`offset` or cursor-based paging — don't wait until it's a real problem.
- [ ] **Backup/restore CLI**: a `nexusdb backup <collection> <path>` / `nexusdb restore <path>` command wrapping the existing save/load, runnable outside the API.

**Done when:** killing `-9` the API process mid-write doesn't corrupt or silently drop data, and there's a passing concurrency test proving it.

---

## Phase 2 — Approximate Nearest Neighbor Index (the differentiator)

**Goal:** this is the part that turns "CRUD app with cosine similarity" into
"vector database." It's also the most fun to build and the best interview story.

- [ ] Design an `Index` protocol/ABC in `nexusdb/core/index/` that `FlatIndex` already implicitly satisfies — formalize it so a second implementation can be swapped in per-collection.
- [ ] Implement **HNSW** (Hierarchical Navigable Small World) from scratch: layered graph construction, greedy search with a candidate heap, configurable `M` (max connections) and `ef_construction`/`ef_search`.
  - Start with insert + search; skip delete-support in the graph initially (mark-as-deleted + periodic rebuild is a fine first pass, and is itself worth documenting as a tradeoff).
- [ ] Let `POST /collections` accept an `index_type: "flat" | "hnsw"` (default `flat` for correctness-by-default) and construction params (`m`, `ef_construction`).
- [ ] **Benchmark suite** (`benchmarks/` at repo root, or `tests/benchmarks/`): measure recall@10 and p50/p95 query latency for `FlatIndex` vs your `HNSWIndex` across a few dataset sizes (10k / 100k / 1M synthetic or real embeddings). Publish the numbers and a plot in the README or a `docs/BENCHMARKS.md`.
- [ ] Document the tradeoff explicitly: exact recall with `FlatIndex`, tunable recall/speed with `HNSWIndex`.

**Done when:** you can point at a chart showing HNSW beating brute force on latency at >95% recall, on your own numbers, on your own machine.

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
