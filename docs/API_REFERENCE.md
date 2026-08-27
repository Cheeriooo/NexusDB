# API Reference (Current)

Base URL in dev: the UI proxies `/api` to the FastAPI server (see
`ui/vite.config.js`). FastAPI also serves interactive docs for free at
`/docs` (Swagger) and `/redoc` — treat this file as a map, not the source of
truth; when in doubt, read `nexusdb/api/server.py` or hit `/docs`.

## Collections

| Method | Path | Description |
|---|---|---|
| `POST` | `/collections` | Create a collection (`name`, `dimension`, `metric`) |
| `GET` | `/collections` | List all collections |
| `GET` | `/collections/{name}` | Get one collection's info |
| `DELETE` | `/collections/{name}` | Delete a collection and its vectors |

`metric` is one of `cosine`, `euclidean` (alias `l2`), `dot` (alias `inner_product`).

## Vectors

| Method | Path | Description |
|---|---|---|
| `POST` | `/vectors/upsert` | Add/update vectors in a collection |
| `POST` | `/vectors/search` | k-NN search (`vector`, `k`, `collection`, `include_metadata`, `include_values`) |
| `GET` | `/vectors/{collection}/{vector_id}` | Fetch one vector by ID |

`vectors/search` does **not** currently accept a metadata filter — it searches
the entire collection. See [ROADMAP.md](./ROADMAP.md) Phase 3.

## Persistence (manual)

| Method | Path | Description |
|---|---|---|
| `POST` | `/collections/save` (or similar — check `server.py`) | Force-save a collection to a SQLite file |
| `POST` | `/collections/load` | Load a collection from a SQLite file |

Auto-persist (save on every write + load on startup) is controlled by the
`NEXUSDB_AUTO_PERSIST` environment variable, not a request parameter.

## Embeddings

| Method | Path | Description |
|---|---|---|
| `POST` | `/embed` | Embed a list of texts with `sentence-transformers` (default model `all-MiniLM-L6-v2`) |
| `POST` | `/embed/upsert` | Embed texts and upsert them into a collection in one call |

The embedding model loads lazily on first use — first request after a cold
start will be slow.

## Visualization

| Method | Path | Description |
|---|---|---|
| `POST` | `/collections/{name}/visualize` | PCA-project up to `k` vectors down to 3D for the Three.js viewer |

## Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Status, version, collection count, total vector count |

## Notable gaps to design around

- No pagination on `GET /collections` or any vector listing endpoint.
- No auth — every endpoint is open to anyone who can reach the process.
- No rate limiting or request size caps (a huge `vectors.upsert` payload is
  accepted as-is).
- No API versioning prefix (`/v1/...`) — breaking changes currently break
  every client immediately.

These are tracked in [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md).
