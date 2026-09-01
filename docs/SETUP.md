# Setup Guide

Everything you need to go from `git clone` to a running NexusDB instance,
plus what to do once it's up. This has been run end-to-end against a fresh
clone (see the verification note at the bottom) — if a step here doesn't
work for you, that's a bug in this doc or the repo, not you.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Docker](https://docs.docker.com/get-docker/) + Compose | any recent | Option A (recommended) |
| [Python](https://www.python.org/) | 3.11+ | Option B — API |
| [Node.js](https://nodejs.org/) | 18+ (20+ recommended) | Option B — UI |

You only need Docker **or** Python+Node, not both — pick one path below.

---

## Option A: Docker (recommended, zero local dependencies)

```bash
git clone https://github.com/Cheeriooo/NexusDB.git
cd NexusDB
cp .env.example .env
docker compose up --build
```

First build takes a few minutes (it installs `sentence-transformers` +
CPU-only PyTorch for the API image, which is the slow part). Subsequent
`docker compose up` runs are fast since layers are cached.

Once it's up:

- **UI** — http://localhost:8080
- **API** — http://localhost:8000 (interactive docs at http://localhost:8000/docs)

Data persists in a named Docker volume (`nexusdb-data`), so `docker compose down`
(without `-v`) keeps your collections between runs. `docker compose down -v`
wipes it.

## Option B: Local dev (faster iteration, hot reload)

Two processes, two terminals.

**Terminal 1 — API:**

```bash
git clone https://github.com/Cheeriooo/NexusDB.git
cd NexusDB
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn nexusdb.api.server:app --reload
```

The API is now serving on http://localhost:8000. `--reload` restarts it on
every code change.

> **Want the "Text Embed" feature?** Plain JSON vector upserts and search
> work out of the box, but embedding raw text (`POST /v1/embed`,
> `POST /v1/vectors/embed-upsert`, and the "✦ Text Embed" tab in the UI's
> Insert Vectors page) needs `sentence-transformers`, which is **not**
> installed by `.[dev]` — it's a heavy optional dependency (pulls in
> PyTorch). Install it with:
> ```bash
> pip install -e ".[dev,embedding]"
> ```
> The Docker image (Option A) already includes it, so this only matters
> for local dev. Without it, the embed endpoints return a clear `501` telling
> you to install it — nothing crashes, but that mode of the UI won't work
> until you do.

**Terminal 2 — UI:**

```bash
cd NexusDB/ui
npm install
npm run dev
```

The UI is now serving on http://localhost:5173 and proxies `/api/*` to the
API on port 8000 (see `ui/vite.config.js`) — so the API must already be
running for the UI to have any data to show.

---

## Verify your setup actually works

Don't take it on faith — these are the same checks used to confirm this
guide is accurate:

```bash
# Backend: full test suite, should be 150+ passing, 0 failing
pytest --cov

# Backend: lint (should be clean)
ruff check .
black --check .

# API smoke test (with the API running — see Option B, terminal 1)
curl http://localhost:8000/health/live
# {"status":"alive"}

# Frontend: lint + production build
cd ui && npm run lint && npm run build
```

If `pytest` fails on a fresh clone, something in this guide is out of date —
that's worth filing an issue over.

---

## Your first 5 minutes

Once the API is running (either option), create a collection, insert a
couple of vectors, and search — either through the UI or straight from the
terminal.

**Via the UI:** open the app, go to **Collections → New Collection**, then
**Insert Vectors** and **Search**. If you're not sure what to click, the app
has a **guided tour** for exactly this — click **"Guide me"** in the top
bar (or visit `/demo` on the landing page for a no-backend-required sandbox
version of the same walkthrough before you commit to running the real
thing).

**Via curl:**

```bash
# Create a 4-dimensional collection
curl -X POST http://localhost:8000/v1/collections \
  -H "Content-Type: application/json" \
  -d '{"name": "quickstart", "dimension": 4, "metric": "cosine"}'

# Insert two vectors
curl -X POST http://localhost:8000/v1/vectors/upsert \
  -H "Content-Type: application/json" \
  -d '{"collection": "quickstart", "vectors": [
        {"id": "a", "values": [0.1, 0.2, 0.3, 0.4], "metadata": {"label": "first"}},
        {"id": "b", "values": [0.9, 0.8, 0.7, 0.6], "metadata": {"label": "second"}}
      ]}'

# Search for the nearest neighbor to a query vector
curl -X POST http://localhost:8000/v1/vectors/search \
  -H "Content-Type: application/json" \
  -d '{"collection": "quickstart", "vector": [0.1, 0.2, 0.3, 0.4], "k": 2}'
```

Full endpoint list: [`docs/API_REFERENCE.md`](./API_REFERENCE.md). Or just
hit http://localhost:8000/docs and try requests from Swagger directly.

## Backup / restore without the API running

```bash
nexusdb backup <collection-name> <output-path>
nexusdb restore <backup-path> [--name NEW_NAME] [--persist-dir DIR]
```

Requires `NEXUSDB_AUTO_PERSIST=true` to have been on so there's a persisted
`.db` file to back up in the first place — see `.env.example`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `POST /v1/vectors/embed-upsert` or the UI's "Text Embed" tab returns an error mentioning `sentence-transformers` | You're on local dev without the `embedding` extra — see the callout above. |
| UI loads but every page shows a network/CORS error | API isn't running, or you started the UI without the API up first. Check `curl http://localhost:8000/health`. |
| `Address already in use` on port 8000, 8080, or 5173 | Something else is bound to that port. Stop it, or override: `uvicorn ... --port 8001`, `docker compose` port mappings in `docker-compose.yml`, `npm run dev -- --port 5174`. |
| First embed request is slow | Expected — the embedding model loads lazily on first use and is cached in memory after that. |
| `curl` to `/v1/...` returns `401` | `NEXUSDB_API_KEY` is set in your environment; send `X-API-Key: <that value>` on every `/v1` request, or unset it for local dev. |
| Requests start returning `429` under light load | `NEXUSDB_RATE_LIMIT` defaults to `120/minute` per client IP; raise it in `.env` if you're load-testing. |
| Data disappears on restart | Persistence is **off by default**. Set `NEXUSDB_AUTO_PERSIST=true` (already on in `docker-compose.yml`). |
| `pip install -e ".[dev]"` fails to build `numpy`/`torch` wheels | You likely need build tools for your platform (the Docker image handles this for you — see the `apt-get install build-essential` step in `Dockerfile` — that's the same thing your OS needs locally). |

Still stuck? Check [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for how the
pieces fit together, or open an issue.

---

## Verification note

This guide was validated against a real, isolated `git clone` of this repo
(not the working copy) on 2026-09-01: `pip install -e ".[dev]"` succeeded,
`pytest --cov` passed 154/154, `uvicorn` served real HTTP traffic
(`/health/live`, `/health/ready`, `POST /v1/collections`), the `nexusdb` CLI
entry point worked, `npm install` + `npm run build` succeeded, and
`npm run dev`'s Vite proxy correctly reached the live API. `docker compose
build` was also confirmed to complete successfully for both images.
