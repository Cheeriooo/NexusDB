<p align="center">
  <img src="docs/brand/logo-on-dark.svg" width="72" height="72" alt="NexusDB logo" />
</p>

# NexusDB

A vector database built from scratch in Python: durable storage, exact and
approximate (HNSW) nearest-neighbor search, metadata filtering, text
embedding, and a web console to explore it — including a from-scratch
implementation of the HNSW index rather than a wrapper around an existing
ANN library.

[![CI](https://github.com/Cheeriooo/NexusDB/actions/workflows/ci.yml/badge.svg)](https://github.com/Cheeriooo/NexusDB/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Why this exists

Most "build your own vector database" projects stop at brute-force cosine
similarity over a Python list. NexusDB goes further: a real approximate
nearest-neighbor index (HNSW) built from first principles, benchmarked
against exact search with recall and latency numbers to back the claims (not
just "it works"), plus the operational pieces — auth, rate limiting,
structured logging, metrics, tracing, tests, CI, Docker — that separate a
weekend script from something you could actually run.

## Features

- **Vector CRUD** with cosine, euclidean, and dot-product distance metrics
- **Two index types per collection**: `flat` (exact, brute-force) and `hnsw`
  (approximate, sub-linear at scale) — see
  [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md) for measured recall/latency
  tradeoffs
- **Metadata filtering** pushed down into the search path for both index types
- **Text embedding** on the fly (`sentence-transformers`), so you can upsert
  and search raw text instead of pre-computed vectors
- **Durable persistence**: incremental writes to SQLite (WAL mode), survives
  a hard process kill without corruption, plus a CLI for backup/restore
- **A 3D "Deep Field" visualizer**: project a collection into 3D (PCA) and
  fly through the embedding space in the browser
- **Production-lean operational baseline**: API-key auth, CORS allow-listing,
  per-IP rate limiting, request body size caps, structured JSON logging,
  Prometheus metrics, OpenTelemetry tracing, health/readiness checks

## Architecture

```
ui/ (React 19 + Vite + Three.js)
   │  fetch('/api/...')
   ▼
nexusdb/api/server.py (FastAPI, versioned under /v1)
   ▼
nexusdb/core/collection.py → nexusdb/core/index/ (FlatIndex | HNSWIndex)
   ▼
nexusdb/utils/distance.py (cosine / euclidean / dot, vectorized with numpy)
   ▼ (optional)
nexusdb/persistence/sqlite_backend.py (one SQLite file per collection)
```

Full write-up, request flow, and the current list of what's implemented vs.
known limitations: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Quick start

**Docker (recommended):**

```bash
cp .env.example .env
docker compose up --build
```

- UI: http://localhost:8080
- API: http://localhost:8000 (interactive docs at `/docs`)

**Local dev:**

```bash
# API
pip install -e ".[dev]"
uvicorn nexusdb.api.server:app --reload

# UI (separate terminal)
cd ui && npm install && npm run dev
```

UI dev server runs on http://localhost:5173 and proxies `/api` to
`http://localhost:8000`.

> Raw JSON vector upserts/search work with just `.[dev]`. The UI's "Text
> Embed" mode and the `/v1/embed*` endpoints need the optional
> `sentence-transformers` dependency — `pip install -e ".[dev,embedding]"`
> (already included in the Docker image). Full walkthrough, verification
> steps, and troubleshooting: **[`docs/SETUP.md`](./docs/SETUP.md)**.

By default the API runs with no auth and in-memory storage only — fine for
local exploration, not for anything reachable outside your machine. See
[Security](#security) below before deploying it anywhere else.

## Security

NexusDB ships with a demo-grade security posture, documented honestly rather
than glossed over:

- Auth (`NEXUSDB_API_KEY`) is a single shared key, off by default — set it
  and don't reuse it anywhere else if you deploy this beyond localhost.
- CORS is allow-list only (`NEXUSDB_CORS_ORIGINS`); it is never `*`.
- Save/load endpoints take a bare filename confined to the server's persist
  directory, not an arbitrary filesystem path.
- There is no multi-tenancy: any client holding the API key can read or write
  any collection.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#security-posture) for the
full rundown of what's covered and what isn't. If you find a security issue,
please open an issue rather than a public PR with exploit details.

## Benchmarks

HNSW vs. brute-force search, measured on this codebase's own implementation
(not a third-party library) at 1k/10k/100k vectors, 128 dimensions, cosine
distance — recall@10, wall-clock latency, and distance-computations-per-query
as a hardware-independent complexity measure. Full methodology, the
`ef_search` sweep, and the honest discussion of where the approximate index
does and doesn't win on wall-clock time: [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md).

## Documentation

- [`docs/SETUP.md`](./docs/SETUP.md) — clone-to-running setup guide, first
  API calls, troubleshooting
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the system works today
- [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md) — REST API surface
- [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md) — ANN vs. brute-force numbers

## Testing

```bash
pytest --cov          # backend: 160+ tests
cd ui && npm run lint  # frontend
```

Both run in CI on every push (`.github/workflows/ci.yml`).

## License

MIT — see [`LICENSE`](./LICENSE).
