"""FastAPI REST API server for NexusDB.

Versioned under /v1 (see `router` below); `/health` stays unversioned since
it's meant for load balancers / orchestrators to hit without caring about API
version. Auth (API key) and rate limiting apply to /v1 only.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from nexusdb.api.config import API_KEY, CORS_ORIGINS, MAX_BODY_SIZE, RATE_LIMIT
from nexusdb.core.collection import Collection
from nexusdb.core.vector import Vector
from nexusdb.persistence.config import AUTO_PERSIST, get_collection_db_path
from nexusdb.persistence.sqlite_backend import SQLiteBackend

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NexusDB",
    description="A vector database built from scratch",
    version="0.1.0",
)


class MaxBodySizeMiddleware:
    """Pure-ASGI middleware capping total request body size.

    Counts bytes as they stream in via `receive()` rather than trusting
    Content-Length, so it also catches chunked-encoding bodies (relevant for
    /v1/vectors/upsert-batch's streaming NDJSON reads).
    """

    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        total = 0

        async def limited_receive():
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body") or b"")
                if total > self.max_bytes:
                    raise HTTPException(status_code=413, detail="Request body too large")
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(MaxBodySizeMiddleware, max_bytes=MAX_BODY_SIZE)

# CORS — allow-list explicit origins only (default: the Vite dev server).
# Configure via NEXUSDB_CORS_ORIGINS (comma-separated) for other deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting — a default per-client-IP limit (NEXUSDB_RATE_LIMIT, default
# 120/minute) applied to every route, no per-endpoint decoration needed.
limiter = Limiter(key_func=get_remote_address, default_limits=[RATE_LIMIT])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Auth dependency for /v1 routes.

    Demo-grade: a single API key from NEXUSDB_API_KEY checked against the
    `X-API-Key` header. When the env var is unset (the default), auth is
    disabled entirely — fine for local dev, not for a real deployment.
    """
    if API_KEY is not None and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Missing or invalid API key")


# All versioned endpoints live under /v1 and require the API key (if configured).
router = APIRouter(prefix="/v1", dependencies=[Depends(require_api_key)])

# In-memory store of collections
_collections: dict[str, Collection] = {}

# One SQLiteBackend per collection, reused across writes so auto-persist can
# do incremental upserts/deletes instead of rewriting the whole table file
# on every single vector write.
_backends: dict[str, SQLiteBackend] = {}


def _get_backend(collection_name: str) -> SQLiteBackend:
    backend = _backends.get(collection_name)
    if backend is None:
        backend = SQLiteBackend(get_collection_db_path(collection_name))
        _backends[collection_name] = backend
    return backend


# ---------------------------------------------------------------------------
# Persistence handlers
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_event():
    """Load persisted collections on startup if auto-persist is enabled."""
    if not AUTO_PERSIST:
        return

    from nexusdb.persistence.config import PERSIST_DIR

    # Find all .db files in persist directory
    if PERSIST_DIR.exists():
        for db_file in PERSIST_DIR.glob("*.db"):
            try:
                col = Collection.load(db_file)
                if col:
                    _collections[col.name] = col
                    _backends[col.name] = SQLiteBackend(db_file)
                    print(f"[ok] Loaded collection: {col.name} ({col.count} vectors)")
            except Exception as e:
                print(f"[warn] Failed to load {db_file}: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Save all collections on shutdown if auto-persist is enabled."""
    if not AUTO_PERSIST:
        return

    for name, col in _collections.items():
        try:
            db_path = get_collection_db_path(name)
            col.save(db_path)
            print(f"[ok] Saved collection: {name} to {db_path}")
        except Exception as e:
            print(f"[warn] Failed to save {name}: {e}")


def _auto_persist_upsert(collection_name: str, vectors: list[Vector]) -> None:
    """Incrementally persist newly-upserted vectors, if auto-persist is enabled."""
    if not AUTO_PERSIST or collection_name not in _collections:
        return
    try:
        col = _collections[collection_name]
        backend = _get_backend(collection_name)
        backend.upsert_metadata(
            collection_name=col.name,
            dimension=col.dimension,
            metric=col.metric,
            created_at=col.created_at.isoformat(),
            updated_at=col.updated_at.isoformat(),
            index_type=col.index_type,
            index_params=col.index_params,
        )
        backend.upsert_vectors(vectors)
    except Exception as e:
        print(f"[warn] Failed to auto-persist upsert for {collection_name}: {e}")


def _auto_persist_delete(collection_name: str, vector_id: str) -> None:
    """Incrementally persist a vector deletion, if auto-persist is enabled."""
    if not AUTO_PERSIST or collection_name not in _collections:
        return
    try:
        col = _collections[collection_name]
        backend = _get_backend(collection_name)
        backend.delete_vectors([vector_id])
        backend.upsert_metadata(
            collection_name=col.name,
            dimension=col.dimension,
            metric=col.metric,
            created_at=col.created_at.isoformat(),
            updated_at=col.updated_at.isoformat(),
            index_type=col.index_type,
            index_params=col.index_params,
        )
    except Exception as e:
        print(f"[warn] Failed to auto-persist delete for {collection_name}: {e}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CollectionCreate(BaseModel):
    name: str = Field(..., description="Unique collection name", examples=["docs"])
    dimension: int = Field(..., gt=0, description="Fixed vector dimensionality for this collection")
    metric: str = Field(
        default="cosine", description="Distance metric: 'cosine', 'euclidean', or 'dot'"
    )
    index_type: str = Field(
        default="flat",
        pattern="^(flat|hnsw)$",
        description="'flat' (exact, brute-force) or 'hnsw' (approximate, faster at scale)",
    )
    # HNSW-only construction params; ignored for index_type='flat'.
    m: int = Field(default=16, ge=2, description="HNSW: max connections per node")
    ef_construction: int = Field(default=200, ge=1, description="HNSW: build-time search width")
    ef_search: int = Field(default=50, ge=1, description="HNSW: default query-time search width")


class CollectionInfo(BaseModel):
    name: str
    dimension: int
    metric: str
    index_type: str
    count: int
    created_at: str
    updated_at: str


class VectorData(BaseModel):
    id: str | None = Field(default=None, description="Vector ID; auto-generated if omitted")
    values: list[float] = Field(..., description="Embedding, must match the collection's dimension")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary JSON metadata")


class UpsertRequest(BaseModel):
    vectors: list[VectorData]
    collection: str


class UpsertResponse(BaseModel):
    ids: list[str]
    count: int


class SearchRequest(BaseModel):
    vector: list[float] = Field(
        ..., description="Query embedding, must match the collection's dimension"
    )
    k: int = Field(default=10, gt=0, description="Number of nearest neighbors to return")
    collection: str = Field(..., description="Name of the collection to search")
    include_metadata: bool = True
    include_values: bool = False
    ef_search: int | None = Field(
        default=None,
        ge=1,
        description="HNSW-only: override the collection's default ef_search for this query",
    )
    filter: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Exact-match metadata filter applied before the distance computation, "
            'e.g. {"category": "docs"}. All key/value pairs must match.'
        ),
        examples=[{"category": "docs"}],
    )


class SearchMatch(BaseModel):
    id: str
    distance: float
    metadata: dict[str, Any] | None = None
    values: list[float] | None = None


class SearchResponse(BaseModel):
    matches: list[SearchMatch]
    collection: str
    query_dimension: int


class VectorResponse(BaseModel):
    id: str
    values: list[float]
    metadata: dict[str, Any]
    collection: str
    dimension: int


class SaveCollectionRequest(BaseModel):
    collection: str
    filepath: str


class SaveCollectionResponse(BaseModel):
    message: str
    collection: str
    filepath: str


class LoadCollectionRequest(BaseModel):
    filepath: str
    collection_name: str | None = None  # Override loaded name if provided


class LoadCollectionResponse(BaseModel):
    message: str
    collection: str
    vector_count: int
    dimension: int


class HealthResponse(BaseModel):
    status: str
    version: str
    collections: int
    total_vectors: int
    timestamp: str


# --- Embedding models ---


class EmbedRequest(BaseModel):
    texts: list[str]
    model: str = "all-MiniLM-L6-v2"


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dimension: int
    model: str
    count: int


class EmbedUpsertItem(BaseModel):
    text: str
    id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EmbedUpsertRequest(BaseModel):
    collection: str
    texts: list[EmbedUpsertItem]
    model: str = "all-MiniLM-L6-v2"


# --- Visualization models ---


class VisualizeRequest(BaseModel):
    k: int = 500


class VisualizeVector(BaseModel):
    id: str
    projected: list[float]  # [x, y, z]
    metadata: dict[str, Any]


class VisualizeResponse(BaseModel):
    vectors: list[VisualizeVector]
    pca_components: list[list[float]]  # shape: (3, d)
    pca_mean: list[float]  # shape: (d,)
    explained_variance_ratio: list[float]
    collection: str
    dimension: int
    count: int
    projection_method: str


# ---------------------------------------------------------------------------
# Collection endpoints
# ---------------------------------------------------------------------------


@router.post("/collections", response_model=CollectionInfo, status_code=201, tags=["collections"])
def create_collection(req: CollectionCreate):
    """Create a new vector collection."""
    if req.name in _collections:
        raise HTTPException(status_code=409, detail=f"Collection '{req.name}' already exists")

    index_params: dict[str, Any] = {}
    if req.index_type == "hnsw":
        index_params = {
            "m": req.m,
            "ef_construction": req.ef_construction,
            "ef_search": req.ef_search,
        }

    try:
        col = Collection(
            name=req.name,
            dimension=req.dimension,
            metric=req.metric,
            index_type=req.index_type,
            index_params=index_params,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    _collections[req.name] = col

    # Auto-save if enabled
    if AUTO_PERSIST:
        try:
            backend = _get_backend(req.name)
            backend.upsert_metadata(
                collection_name=col.name,
                dimension=col.dimension,
                metric=col.metric,
                created_at=col.created_at.isoformat(),
                updated_at=col.updated_at.isoformat(),
                index_type=col.index_type,
                index_params=col.index_params,
            )
        except Exception as e:
            print(f"[warn] Failed to auto-save collection {req.name}: {e}")

    return CollectionInfo(**col.info())


@router.get("/collections", response_model=list[CollectionInfo], tags=["collections"])
def list_collections(
    limit: int = Query(default=100, gt=0, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """List collections, paginated (default page size 100, ordered by name)."""
    names = sorted(_collections.keys())
    page = names[offset : offset + limit]
    return [CollectionInfo(**_collections[name].info()) for name in page]


@router.get("/collections/{name}", response_model=CollectionInfo, tags=["collections"])
def get_collection(name: str):
    """Get information about a specific collection."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")
    return CollectionInfo(**_collections[name].info())


@router.delete("/collections/{name}", status_code=200, tags=["collections"])
def delete_collection(name: str):
    """Delete a collection and all its vectors."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")

    del _collections[name]
    _backends.pop(name, None)

    # Clean up persisted data if enabled
    if AUTO_PERSIST:
        try:
            import os

            db_path = get_collection_db_path(name)
            if db_path.exists():
                os.remove(db_path)
            for suffix in ("-wal", "-shm"):
                sidecar = db_path.with_name(db_path.name + suffix)
                if sidecar.exists():
                    os.remove(sidecar)
        except Exception as e:
            print(f"[warn] Failed to delete persisted data for {name}: {e}")

    return {"message": f"Collection '{name}' deleted"}


# ---------------------------------------------------------------------------
# Vector endpoints
# ---------------------------------------------------------------------------


@router.post("/vectors/upsert", response_model=UpsertResponse, tags=["vectors"])
def upsert_vectors(req: UpsertRequest):
    """Add or update vectors in a collection."""
    if req.collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{req.collection}' not found")

    col = _collections[req.collection]

    vectors: list[Vector] = []
    for vd in req.vectors:
        try:
            vec = Vector(
                embedding=vd.values,
                id=vd.id if vd.id else None,
                metadata=vd.metadata,
            )
            # Let Vector auto-generate ID if None
            if vd.id:
                vec.id = vd.id
            vectors.append(vec)
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        ids = col.add(vectors)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Auto-persist if enabled — incremental, not a full-table rewrite.
    _auto_persist_upsert(req.collection, vectors)

    return UpsertResponse(ids=ids, count=len(ids))


@router.post("/vectors/upsert-batch", response_model=UpsertResponse, tags=["vectors"])
async def upsert_vectors_batch(
    request: Request,
    collection: str = Query(..., description="Target collection name"),
    batch_size: int = Query(
        default=500, gt=0, le=10000, description="Vectors per internal add() call"
    ),
):
    """Streaming bulk upsert for large imports.

    Body is newline-delimited JSON (NDJSON) — one vector object per line,
    e.g. `{"id": "...", "values": [...], "metadata": {...}}`. The request
    body is read and parsed incrementally and applied in batches of
    `batch_size`, so importing millions of vectors doesn't require holding
    one giant JSON document in memory at once.
    """
    if collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")
    col = _collections[collection]

    all_ids: list[str] = []
    pending: list[Vector] = []
    buffer = b""

    def flush() -> None:
        if not pending:
            return
        try:
            ids = col.add(pending)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        _auto_persist_upsert(collection, list(pending))
        all_ids.extend(ids)
        pending.clear()

    def parse_line(line: bytes) -> None:
        line = line.strip()
        if not line:
            return
        try:
            obj = json.loads(line)
            vd = VectorData(**obj)
            vec = Vector(embedding=vd.values, id=vd.id or None, metadata=vd.metadata)
        except (json.JSONDecodeError, ValidationError, ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid vector line: {e}") from e
        pending.append(vec)
        if len(pending) >= batch_size:
            flush()

    async for chunk in request.stream():
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            parse_line(line)
    parse_line(buffer)
    flush()

    return UpsertResponse(ids=all_ids, count=len(all_ids))


@router.post("/vectors/search", response_model=SearchResponse, tags=["search"])
def search_vectors(req: SearchRequest):
    """Search for nearest-neighbor vectors."""
    if req.collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{req.collection}' not found")

    col = _collections[req.collection]

    if len(req.vector) != col.dimension:
        raise HTTPException(
            status_code=400,
            detail=f"Query dimension {len(req.vector)} doesn't match "
            f"collection dimension {col.dimension}",
        )

    results = col.search(req.vector, k=req.k, ef_search=req.ef_search, filter=req.filter)

    matches: list[SearchMatch] = []
    for r in results:
        match = SearchMatch(id=r.id, distance=r.distance)
        if req.include_metadata and r.vector:
            match.metadata = r.vector.metadata
        if req.include_values and r.vector:
            match.values = r.vector.embedding.tolist()
        matches.append(match)

    return SearchResponse(
        matches=matches,
        collection=req.collection,
        query_dimension=len(req.vector),
    )


@router.get("/vectors/{collection}/{vector_id}", response_model=VectorResponse, tags=["vectors"])
def get_vector(collection: str, vector_id: str):
    """Get a specific vector by ID."""
    if collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    vec = _collections[collection].get(vector_id)
    if vec is None:
        raise HTTPException(status_code=404, detail=f"Vector '{vector_id}' not found")

    return VectorResponse(
        id=vec.id,
        values=vec.embedding.tolist(),
        metadata=vec.metadata,
        collection=vec.collection,
        dimension=vec.dimension,
    )


@router.delete("/vectors/{collection}/{vector_id}", status_code=200, tags=["vectors"])
def delete_vector(collection: str, vector_id: str):
    """Delete a vector by ID."""
    if collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    removed = _collections[collection].delete(vector_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Vector '{vector_id}' not found")

    # Auto-persist if enabled — incremental, not a full-table rewrite.
    _auto_persist_delete(collection, vector_id)

    return {"message": f"Vector '{vector_id}' deleted"}


# ---------------------------------------------------------------------------
# Persistence endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/collections/{name}/save", response_model=SaveCollectionResponse, tags=["persistence"]
)
def save_collection(name: str, req: SaveCollectionRequest):
    """Save a collection to disk."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")

    try:
        col = _collections[name]
        col.save(req.filepath)
        return SaveCollectionResponse(
            message=f"Collection '{name}' saved successfully",
            collection=name,
            filepath=req.filepath,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save collection: {e}") from e


@router.post("/collections/load", response_model=LoadCollectionResponse, tags=["persistence"])
def load_collection(req: LoadCollectionRequest):
    """Load a collection from disk."""
    try:
        from nexusdb.core.collection import Collection

        col = Collection.load(req.filepath)
        if col is None:
            raise HTTPException(
                status_code=400,
                detail=f"Could not load collection from {req.filepath}",
            )

        # Override collection name if provided
        if req.collection_name:
            col.name = req.collection_name

        # Store in collections
        if col.name in _collections:
            raise HTTPException(
                status_code=409,
                detail=f"Collection '{col.name}' already exists",
            )

        _collections[col.name] = col

        return LoadCollectionResponse(
            message="Collection loaded successfully",
            collection=col.name,
            vector_count=col.count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load collection: {e}") from e


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check():
    """System health check."""
    total = sum(col.count for col in _collections.values())
    return HealthResponse(
        status="ok",
        version="0.1.0",
        collections=len(_collections),
        total_vectors=total,
        timestamp=datetime.now(UTC).isoformat(),
    )


# ---------------------------------------------------------------------------
# Embedding model (lazy-loaded)
# ---------------------------------------------------------------------------

_embedding_model = None
_embedding_model_name: str | None = None


def _get_embedding_model(model_name: str = "all-MiniLM-L6-v2"):
    global _embedding_model, _embedding_model_name
    if _embedding_model is None or _embedding_model_name != model_name:
        try:
            from sentence_transformers import SentenceTransformer

            print(f"[info] Loading embedding model '{model_name}'...")
            _embedding_model = SentenceTransformer(model_name)
            _embedding_model_name = model_name
            print(f"[ok] Embedding model '{model_name}' loaded.")
        except ImportError as e:
            raise HTTPException(
                status_code=501,
                detail=(
                    "sentence-transformers is not installed. "
                    "Run: pip install sentence-transformers"
                ),
            ) from e
    return _embedding_model


# ---------------------------------------------------------------------------
# Embedding endpoints
# ---------------------------------------------------------------------------


@router.post("/embed", response_model=EmbedResponse, tags=["embedding"])
def embed_texts(req: EmbedRequest):
    """Embed a list of texts using a sentence transformer model."""
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts list must not be empty")
    model = _get_embedding_model(req.model)
    try:
        embeddings = model.encode(req.texts, convert_to_numpy=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}") from e
    return EmbedResponse(
        embeddings=embeddings.tolist(),
        dimension=int(embeddings.shape[1]),
        model=req.model,
        count=len(req.texts),
    )


@router.post("/vectors/embed-upsert", response_model=UpsertResponse, tags=["embedding"])
def embed_upsert_vectors(req: EmbedUpsertRequest):
    """Embed texts and upsert the resulting vectors into a collection."""
    if req.collection not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{req.collection}' not found")
    col = _collections[req.collection]

    model = _get_embedding_model(req.model)
    texts = [item.text for item in req.texts]
    try:
        embeddings = model.encode(texts, convert_to_numpy=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}") from e

    embed_dim = int(embeddings.shape[1])
    if embed_dim != col.dimension:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Embedding dimension ({embed_dim}) doesn't match collection "
                f"dimension ({col.dimension}). "
                f"Create a collection with dimension={embed_dim} to use this model."
            ),
        )

    vectors: list[Vector] = []
    for i, item in enumerate(req.texts):
        meta = {**item.metadata, "text": item.text, "label": item.text[:80]}
        vec = Vector(embedding=embeddings[i], metadata=meta)
        if item.id:
            vec.id = item.id
        vectors.append(vec)

    try:
        ids = col.add(vectors)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    _auto_persist_upsert(req.collection, vectors)
    return UpsertResponse(ids=ids, count=len(ids))


# ---------------------------------------------------------------------------
# Visualization endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/collections/{name}/visualize", response_model=VisualizeResponse, tags=["visualization"]
)
def visualize_collection(name: str, req: VisualizeRequest):
    """Return vectors projected to 3D via PCA with principal components for query projection."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")

    col = _collections[name]
    d = col.dimension

    all_vecs = list(col._index._vectors.values())
    total = len(all_vecs)

    if total == 0:
        return VisualizeResponse(
            vectors=[],
            pca_components=[],
            pca_mean=[],
            explained_variance_ratio=[],
            collection=name,
            dimension=d,
            count=0,
            projection_method="pca",
        )

    # Random sample up to k (fixed seed for reproducibility)
    k = min(req.k, total)
    if k < total:
        rng = np.random.default_rng(42)
        indices = rng.choice(total, k, replace=False)
        selected = [all_vecs[i] for i in indices]
    else:
        selected = all_vecs

    n = len(selected)
    ids = [v.id for v in selected]
    metadatas = [v.metadata for v in selected]

    X = np.array([v.embedding for v in selected], dtype=np.float64)  # (n, d)
    mean = X.mean(axis=0)
    X_centered = X - mean

    if d <= 3:
        projected = np.zeros((n, 3), dtype=np.float64)
        projected[:, :d] = X_centered
        components = np.eye(3, d, dtype=np.float64)
        evr = [1.0 / 3, 1.0 / 3, 1.0 / 3]
        method = "identity"
    else:
        n_components = min(3, n - 1, d)

        if d > 512 and n < d:
            # Randomized PCA: project to lower dim first to avoid d×d ops
            rng2 = np.random.default_rng(42)
            proj_dim = min(128, n)
            R = rng2.standard_normal((d, proj_dim))
            Y = X_centered @ R
            _, _, Vt_low = np.linalg.svd(Y, full_matrices=False)
            comp_low = Vt_low[:n_components, :]
            comps = comp_low @ R.T
            Q, _ = np.linalg.qr(comps.T)
            components = Q[:, :n_components].T
            projected_nc = X_centered @ components.T
            evr = [1.0 / 3] * 3
            method = "randomized_pca"
        else:
            U, S, Vt = np.linalg.svd(X_centered, full_matrices=False)
            components = Vt[:n_components, :]
            projected_nc = X_centered @ components.T
            total_var = float(np.sum(S**2))
            if total_var > 0:
                evr = (S[:n_components] ** 2 / total_var).tolist()
            else:
                evr = [1.0 / 3] * n_components
            method = "pca"

        projected = np.zeros((n, 3), dtype=np.float64)
        projected[:, :n_components] = projected_nc

        if n_components < 3:
            pad = np.zeros((3 - n_components, d), dtype=np.float64)
            components = np.vstack([components, pad])
            evr = evr + [0.0] * (3 - n_components)

    vector_results = [
        VisualizeVector(
            id=ids[i],
            projected=projected[i].tolist(),
            metadata=metadatas[i],
        )
        for i in range(n)
    ]

    return VisualizeResponse(
        vectors=vector_results,
        pca_components=components.tolist(),
        pca_mean=mean.tolist(),
        explained_variance_ratio=evr[:3],
        collection=name,
        dimension=d,
        count=n,
        projection_method=method,
    )


# ---------------------------------------------------------------------------
# Mount versioned router
# ---------------------------------------------------------------------------

app.include_router(router)
