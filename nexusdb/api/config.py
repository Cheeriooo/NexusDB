"""Configuration for the NexusDB API layer (auth, CORS, rate limiting)."""

import os

# API-key auth. When unset (default), auth is disabled — fine for local dev
# and the portfolio demo. Set NEXUSDB_API_KEY to require every /v1 request
# (except /health) to send a matching `X-API-Key` header.
API_KEY = os.getenv("NEXUSDB_API_KEY") or None

# Comma-separated list of allowed CORS origins. Defaults to the Vite dev
# server only — deliberately not "*", so a browser client on another origin
# can't call this API unless explicitly allow-listed.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("NEXUSDB_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

# Default per-client rate limit, in slowapi's "<count>/<period>" syntax.
RATE_LIMIT = os.getenv("NEXUSDB_RATE_LIMIT", "120/minute")

# Max request body size in bytes, enforced across the whole body as it
# streams in (not just a Content-Length check). Default 50 MiB.
MAX_BODY_SIZE = int(os.getenv("NEXUSDB_MAX_BODY_SIZE", str(50 * 1024 * 1024)))
