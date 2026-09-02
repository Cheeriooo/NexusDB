# API Reference (Current)

Base URL in dev: the UI proxies `/api` to the FastAPI server (see
`ui/vite.config.js`). FastAPI also serves interactive docs for free at
`/docs` (Swagger) and `/redoc` — treat this file as a map, not the source of
truth; when in doubt, read `nexusdb/api/server.py` or hit `/docs`.

All endpoints below except `/health*` and `/metrics` are versioned under
`/v1` (e.g. `POST /v1/collections`) and, if `NEXUSDB_API_KEY` is set, require
a matching `X-API-Key` header.

## Collections

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/collections` | Create a collection (`name`, `dimension`, `metric`, `index_type: "flat"\|"hnsw"`, HNSW params) |
| `GET` | `/v1/collections` | List collections, paginated (`limit` default 100/max 1000, `offset`) |
| `GET` | `/v1/collections/{name}` | Get one collection's info |
| `DELETE` | `/v1/collections/{name}` | Delete a collection and its vectors |

`metric` is one of `cosine`, `euclidean` (alias `l2`), `dot` (alias `inner_product`).

## Vectors

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/vectors/upsert` | Add/update vectors in a collection |
| `POST` | `/v1/vectors/upsert-batch?collection=...` | Streaming NDJSON bulk upsert (one vector object per line), for large imports |
| `POST` | `/v1/vectors/search` | k-NN search (`vector`, `k`, `collection`, `filter`, `ef_search`, `include_metadata`, `include_values`) |
| `GET` | `/v1/vectors/{collection}/{vector_id}` | Fetch one vector by ID |
| `DELETE` | `/v1/vectors/{collection}/{vector_id}` | Delete a vector by ID |

`search`'s `filter` is an exact-match metadata dict (e.g. `{"category": "docs"}`,
all key/value pairs must match), applied before the distance computation.
`ef_search` only affects `hnsw` collections.

## Persistence (manual)

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/collections/{name}/save` | Force-save a collection to a SQLite file |
| `POST` | `/v1/collections/load` | Load a collection from a SQLite file |

`filepath` on both endpoints is a bare filename (no `/`, `\`, or `..`) resolved
against `NEXUSDB_PERSIST_DIR` on the server — not an arbitrary filesystem
path, so a remote client can't read or write files outside that directory.
For an arbitrary source/destination path, use the CLI below, which runs
locally with whatever filesystem access you already have.

Auto-persist (incremental save on every write + load on startup) is
controlled by the `NEXUSDB_AUTO_PERSIST` environment variable, not a request
parameter. `nexusdb backup <collection> <path>` / `nexusdb restore <path>`
does the same job from the CLI, without the API process running.

## Embeddings

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/embed` | Embed a list of texts with `sentence-transformers` (default model `all-MiniLM-L6-v2`) |
| `POST` | `/v1/vectors/embed-upsert` | Embed texts and upsert them into a collection in one call |

The embedding model loads lazily on first use — first request after a cold
start will be slow. Requires the optional `sentence-transformers` dependency
(not installed by `pip install -e ".[dev]"` alone — see
[`docs/SETUP.md`](./SETUP.md)); without it these return `501`.

## Visualization

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/collections/{name}/visualize` | PCA-project up to `k` vectors down to 3D for the Three.js viewer |

## Health & Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Combined status, version, collection count, total vector count (kept for backwards compatibility) |
| `GET` | `/health/live` | Liveness — always 200 once the process is serving; use for a container/orchestrator restart trigger |
| `GET` | `/health/ready` | Readiness — 503 until persisted collections finish loading (only relevant with `NEXUSDB_AUTO_PERSIST=true`); use to gate traffic routing |
| `GET` | `/metrics` | Prometheus format: request count/latency, `nexusdb_collection_vectors`, `nexusdb_collections_total` |

Every response also carries an `X-Request-ID` header (echoed back if the
caller sent one, generated otherwise) that ties the response to its
structured JSON log line server-side.

## Notable gaps to design around

- No horizontal scalability — a single in-process dict is the source of
  truth, so this is one process, one machine.
- Auth is demo-grade: one shared `X-API-Key`, not per-key records or
  multi-tenancy — any client with the key can read/write any collection.
- No dependency vulnerability scanning (`pip-audit`/`npm audit`/Dependabot).
