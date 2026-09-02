# Architecture (Current State)

A snapshot of how NexusDB actually works today. Keep it updated as things change.

## Components

```
ui/ (React 19 + Vite + Three.js)
   │  fetch('/api/...')  — proxied to the API in dev (vite.config.js)
   ▼
nexusdb/api/server.py (FastAPI, versioned under /v1)
   │  auth (X-API-Key), CORS allow-list, rate limiting, body-size cap
   │  holds `_collections: Dict[str, Collection]` in process memory
   ▼
nexusdb/core/collection.py (Collection)
   │  enforces dimension + metric, delegates to one Index per collection
   ▼
nexusdb/core/index/ (Index protocol: FlatIndex | HNSWIndex)
   │  FlatIndex:  dict[id → Vector] + a rebuilt (N, D) numpy matrix, exact O(n) search
   │  HNSWIndex:  layered graph, greedy search, approximate sub-linear search
   ▼
nexusdb/utils/distance.py — cosine / euclidean / dot, vectorized with numpy
   │
   ▼ (optional, opt-in via NEXUSDB_AUTO_PERSIST)
nexusdb/persistence/sqlite_backend.py — one SQLite file per collection, incremental writes
```

Cross-cutting: `nexusdb/observability/` (structured JSON logging with a
per-request `request_id`, Prometheus metrics at `/metrics`, OpenTelemetry
tracing across the search path, off by default).

## Request flow (search)

1. `POST /v1/vectors/search` → FastAPI validates the payload with Pydantic
   (auth/CORS/rate-limit middleware run first).
2. `Collection.search()` converts the query to `float32`, turns an optional
   metadata `filter` into an `ids_filter` set, and delegates to the
   collection's index (`FlatIndex` or `HNSWIndex`).
3. `FlatIndex` computes distances against every stored vector (`utils/distance.py`)
   and returns the top-k via `argpartition` — exact, O(n) per query.
   `HNSWIndex` instead does a greedy graph walk bounded by `ef_search`,
   trading a small amount of recall for sub-linear search at scale.
4. Results are mapped back to `SearchMatch` and returned as JSON.

See [`docs/BENCHMARKS.md`](./BENCHMARKS.md) for measured recall/latency
numbers comparing the two index types at 1k/10k/100k vectors.

## Persistence model

- Persistence is **off by default** (`NEXUSDB_AUTO_PERSIST` env var).
- When enabled, each collection is stored as `<NEXUSDB_PERSIST_DIR>/<name>.db`,
  a SQLite file (`PRAGMA journal_mode=WAL`) with a `vectors` table (id,
  embedding BLOB, metadata JSON) and a `collection_metadata` key/value table.
- Writes are **incremental**: every upsert/delete calls `SQLiteBackend`'s
  targeted insert/update/delete, not a full-table rewrite, so auto-persist is
  cheap to leave on. A full rewrite still happens for the explicit
  `POST /v1/collections/{name}/save` export and the CLI backup, where a full
  snapshot is the actual intent.
- On startup, every `*.db` file in the persist directory is loaded back into
  the in-memory `_collections` dict; `/health/ready` returns 503 until that
  finishes.
- `filepath` on the save/load endpoints is a bare filename resolved against
  `NEXUSDB_PERSIST_DIR` — not an arbitrary filesystem path — so a remote
  client can't read or write files elsewhere on disk. For an arbitrary
  source/destination, use `nexusdb backup`/`nexusdb restore` (the CLI), which
  runs locally with whatever filesystem access you already have.

## Security posture

- **Auth**: optional single shared `X-API-Key` (`NEXUSDB_API_KEY`), off by
  default. This is demo-grade — no per-key records, no multi-tenancy; any
  client holding the key can read/write any collection.
- **CORS**: allow-list only (`NEXUSDB_CORS_ORIGINS`), never `*`.
- **Rate limiting**: per-client-IP (`NEXUSDB_RATE_LIMIT`, default `120/minute`).
- **Body size cap**: `NEXUSDB_MAX_BODY_SIZE` (default 50 MiB), enforced while
  streaming so it also catches chunked bodies.
- Collection names are restricted to `[A-Za-z0-9_-]` — this also closes a
  path-traversal angle through auto-persist filenames.

None of this adds up to "safe to expose directly on the public internet
without a reverse proxy and TLS" — put NexusDB behind a proxy that terminates
TLS, and set `NEXUSDB_API_KEY`/`NEXUSDB_CORS_ORIGINS` before deploying it
anywhere beyond localhost.

## What's real vs. what's a placeholder

| Area | Status |
|---|---|
| Vector CRUD, cosine/euclidean/dot search | Implemented, unit-tested |
| Collections (namespacing by dimension/metric) | Implemented |
| SQLite persistence | Implemented, incremental writes + WAL |
| Approximate nearest-neighbor index (HNSW) | Implemented from scratch (`nexusdb/core/index/hnsw_index.py`); tradeoffs measured, not assumed — see `docs/BENCHMARKS.md` |
| Metadata filtering on search | Implemented — `SearchRequest.filter`, pushed down before the distance computation |
| Auth / CORS / rate limiting | Implemented, demo-grade (see "Security posture" above) |
| Observability (logs/metrics/tracing) | Implemented — structured JSON logs, `/metrics`, OpenTelemetry (opt-in) |
| Horizontal scaling / clustering | **Not implemented** — single process, in-memory dict is the source of truth |
| Embeddings | `POST /v1/embed*` endpoints, backed by the optional `sentence-transformers` dependency |
| 3D visualization | `POST /v1/collections/{name}/visualize` (PCA projection) |
| CI/CD | `.github/workflows/ci.yml` — lint, test, build, docker build |
| Containerization | `Dockerfile` (API, non-root user) + `ui/Dockerfile` (nginx) + `docker-compose.yml` |
| License | MIT (`LICENSE`, matches `pyproject.toml`) |

## Known constraints worth knowing before you extend this

- **Single process, in-memory source of truth.** `_collections` lives in the
  FastAPI process's RAM. Restarting the process loses everything unless
  auto-persist is on, and even then, only what was last persisted.
- **HNSW's wall-clock win isn't free at this scale.** The from-scratch,
  pure-Python HNSW implementation reduces distance computations dramatically
  (see `docs/BENCHMARKS.md`), but doesn't reliably beat `FlatIndex` on
  wall-clock latency until ~100k vectors, because NumPy's vectorized brute
  force is hard to beat with a per-hop Python loop. The algorithmic argument
  is real; the constant-factor argument depends on scale.
- **No filter pushdown across collections.** Filtering is per-collection and
  in-process; there's no cross-collection query planner.
- **Single shared API key, no multi-tenancy.** Fine for a personal/demo
  deployment; not a substitute for real per-tenant auth.
