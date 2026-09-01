# NexusDB
Vector Database

## Quick start

**Docker (recommended):**

```bash
cp .env.example .env
docker compose up --build
```

- UI: http://localhost:8080
- API: http://localhost:8000 (docs at `/docs`)

**Local dev:**

```bash
# API
pip install -e ".[dev]"
uvicorn nexusdb.api.server:app --reload

# UI (separate terminal)
cd ui && npm install && npm run dev
```

UI dev server runs on http://localhost:5173 and proxies `/api` to `http://localhost:8000`.

> Raw JSON vector upserts/search work with just `.[dev]`. The UI's "Text
> Embed" mode and the `/v1/embed*` endpoints need the optional
> `sentence-transformers` dependency — `pip install -e ".[dev,embedding]"`
> (already included in the Docker image). Full walkthrough, verification
> steps, and troubleshooting: **[`docs/SETUP.md`](./docs/SETUP.md)**.

## Documentation

Planning and reference docs live in [`docs/`](./docs):

- [`docs/SETUP.md`](./docs/SETUP.md) — clone-to-running setup guide, first API calls, troubleshooting
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the system works today
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phased plan to a portfolio-grade, production-ready project
- [`docs/PRODUCTION_READINESS.md`](./docs/PRODUCTION_READINESS.md) — checklist of what "production-ready" requires
- [`docs/API_REFERENCE.md`](./docs/API_REFERENCE.md) — REST API surface
