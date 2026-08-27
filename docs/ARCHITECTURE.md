# Architecture (Current State)

A snapshot of how NexusDB actually works today, as of this writing. This is the
baseline the [roadmap](./ROADMAP.md) builds from — keep it updated as things change.

## Components

```
ui/ (React 19 + Vite + Three.js)
   │  fetch('/api/...')  — proxied to the API in dev (vite.config.js)
   ▼
nexusdb/api/server.py (FastAPI)
   │  holds `_collections: Dict[str, Collection]` in process memory
   ▼
nexusdb/core/collection.py (Collection)
   │  wraps one FlatIndex per collection, enforces dimension + metric
   ▼
nexusdb/core/index/flat_index.py (FlatIndex)
   │  dict[id → Vector] + a rebuilt (N, D) numpy matrix
   ▼
nexusdb/utils/distance.py — cosine / euclidean / dot, vectorized with numpy
   │
   ▼ (optional, opt-in)
nexusdb/persistence/sqlite_backend.py — one SQLite file per collection
```

## Request flow (search)

1. `POST /vectors/search` → FastAPI validates the payload with Pydantic.
2. `Collection.search()` converts the query to `float32` and delegates to `FlatIndex.search()`.
3. `FlatIndex` rebuilds its dense matrix if dirty, computes distances against
   **every** stored vector via `utils/distance.py`, and returns the top-k via
   `argpartition`.
4. Results are mapped back to `SearchMatch` and returned as JSON.

This is exact nearest-neighbor search — correct, simple, and O(n) per query.

## Persistence model

- Persistence is **off by default** (`NEXUSDB_AUTO_PERSIST` env var).
- When enabled, each collection is stored as `./data/<name>.db`, a SQLite file
  with a `vectors` table (id, embedding BLOB, metadata JSON) and a
  `collection_metadata` key/value table.
- `SQLiteBackend.save_collection()` does `DELETE FROM vectors` then re-inserts
  every vector — a **full rewrite**, not an incremental write. It runs on every
  mutation when auto-persist is on, and once more at process shutdown.
- On startup, every `*.db` file in the persist directory is loaded back into
  the in-memory `_collections` dict.

## What's real vs. what's a placeholder

| Area | Status |
|---|---|
| Vector CRUD, cosine/euclidean/dot search | Implemented, unit-tested |
| Collections (namespacing by dimension/metric) | Implemented |
| SQLite persistence | Implemented, but full-rewrite-on-save (see [ROADMAP](./ROADMAP.md) Phase 1) |
| Approximate nearest-neighbor index | **Not implemented** — `FlatIndex` is the only index type |
| Metadata filtering on search | **Not implemented** — `ids_filter` exists internally but isn't exposed via the API |
| Auth / multi-tenancy | **Not implemented** — no API keys, CORS is `allow_origins=["*"]` |
| Horizontal scaling / clustering | **Not implemented** — single process, in-memory dict |
| Embeddings | `POST /embed*` endpoints exist, backed by `sentence-transformers` |
| 3D visualization | `POST /collections/{name}/visualize` (PCA projection) — check `server.py` for the exact route as it evolves |
| Observability (logs/metrics/tracing) | `print()` statements only — no structured logging |
| CI/CD | None — no `.github/workflows` |
| Containerization | None — no Dockerfile |
| License | None committed (pyproject.toml claims MIT, no LICENSE file) |

## Known constraints worth knowing before you extend this

- **Single process, in-memory source of truth.** `_collections` lives in the
  FastAPI process's RAM. Restarting the process loses everything unless
  auto-persist is on, and even then, only what was last saved.
- **O(n) search.** Fine up to tens of thousands of vectors; will visibly slow
  down beyond that. This is the single highest-leverage thing to fix for a
  "built a vector database" portfolio claim to hold up under questioning.
- **No filter pushdown.** Any "search within a subset" use case currently
  means fetching everything and filtering client-side.
- **CORS wide open, no auth.** Fine for a local demo, not fine for anything
  public-facing as-is.
