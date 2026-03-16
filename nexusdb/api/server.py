"""FastAPI REST API server for NexusDB."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from nexusdb.core.collection import Collection
from nexusdb.core.vector import Vector
from nexusdb.persistence.config import AUTO_PERSIST, get_collection_db_path

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NexusDB",
    description="A vector database built from scratch",
    version="0.1.0",
)

# CORS — allow the Vite dev server & any frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store of collections
_collections: Dict[str, Collection] = {}


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
                collection_name = db_file.stem  # filename without .db
                col = Collection.load(db_file)
                if col:
                    _collections[col.name] = col
                    print(f"✅ Loaded collection: {col.name} ({col.count} vectors)")
            except Exception as e:
                print(f"⚠️  Failed to load {db_file}: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Save all collections on shutdown if auto-persist is enabled."""
    if not AUTO_PERSIST:
        return
    
    for name, col in _collections.items():
        try:
            db_path = get_collection_db_path(name)
            col.save(db_path)
            print(f"✅ Saved collection: {name} to {db_path}")
        except Exception as e:
            print(f"⚠️  Failed to save {name}: {e}")


def _auto_save_collection(collection_name: str) -> None:
    """Helper to auto-save a collection if AUTO_PERSIST is enabled."""
    if not AUTO_PERSIST or collection_name not in _collections:
        return
    
    try:
        col = _collections[collection_name]
        db_path = get_collection_db_path(collection_name)
        col.save(db_path)
    except Exception as e:
        print(f"⚠️  Failed to auto-save collection {collection_name}: {e}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CollectionCreate(BaseModel):
    name: str
    dimension: int
    metric: str = "cosine"


class CollectionInfo(BaseModel):
    name: str
    dimension: int
    metric: str
    count: int
    created_at: str
    updated_at: str


class VectorData(BaseModel):
    id: Optional[str] = None
    values: List[float]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class UpsertRequest(BaseModel):
    vectors: List[VectorData]
    collection: str


class UpsertResponse(BaseModel):
    ids: List[str]
    count: int


class SearchRequest(BaseModel):
    vector: List[float]
    k: int = 10
    collection: str
    include_metadata: bool = True
    include_values: bool = False


class SearchMatch(BaseModel):
    id: str
    distance: float
    metadata: Optional[Dict[str, Any]] = None
    values: Optional[List[float]] = None


class SearchResponse(BaseModel):
    matches: List[SearchMatch]
    collection: str
    query_dimension: int


class VectorResponse(BaseModel):
    id: str
    values: List[float]
    metadata: Dict[str, Any]
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
    collection_name: Optional[str] = None  # Override loaded name if provided


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
    texts: List[str]
    model: str = "all-MiniLM-L6-v2"


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int
    model: str
    count: int


class EmbedUpsertItem(BaseModel):
    text: str
    id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmbedUpsertRequest(BaseModel):
    collection: str
    texts: List[EmbedUpsertItem]
    model: str = "all-MiniLM-L6-v2"


# --- Visualization models ---

class VisualizeRequest(BaseModel):
    k: int = 500


class VisualizeVector(BaseModel):
    id: str
    projected: List[float]   # [x, y, z]
    metadata: Dict[str, Any]


class VisualizeResponse(BaseModel):
    vectors: List[VisualizeVector]
    pca_components: List[List[float]]   # shape: (3, d)
    pca_mean: List[float]               # shape: (d,)
    explained_variance_ratio: List[float]
    collection: str
    dimension: int
    count: int
    projection_method: str


# ---------------------------------------------------------------------------
# Collection endpoints
# ---------------------------------------------------------------------------


@app.post("/collections", response_model=CollectionInfo, status_code=201)
def create_collection(req: CollectionCreate):
    """Create a new vector collection."""
    if req.name in _collections:
        raise HTTPException(status_code=409, detail=f"Collection '{req.name}' already exists")

    try:
        col = Collection(name=req.name, dimension=req.dimension, metric=req.metric)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _collections[req.name] = col
    
    # Auto-save if enabled
    if AUTO_PERSIST:
        try:
            db_path = get_collection_db_path(req.name)
            col.save(db_path)
        except Exception as e:
            print(f"⚠️  Failed to auto-save collection {req.name}: {e}")
    
    return CollectionInfo(**col.info())


@app.get("/collections", response_model=List[CollectionInfo])
def list_collections():
    """List all collections."""
    return [CollectionInfo(**col.info()) for col in _collections.values()]


@app.get("/collections/{name}", response_model=CollectionInfo)
def get_collection(name: str):
    """Get information about a specific collection."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")
    return CollectionInfo(**_collections[name].info())


@app.delete("/collections/{name}", status_code=200)
def delete_collection(name: str):
    """Delete a collection and all its vectors."""
    if name not in _collections:
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found")
    
    del _collections[name]
    
    # Clean up persisted data if enabled
    if AUTO_PERSIST:
        try:
            import os
            db_path = get_collection_db_path(name)
            if db_path.exists():
                os.remove(db_path)
        except Exception as e:
            print(f"⚠️  Failed to delete persisted data for {name}: {e}")
    
    return {"message": f"Collection '{name}' deleted"}


# ---------------------------------------------------------------------------
# Vector endpoints
# ---------------------------------------------------------------------------


@app.post("/vectors/upsert", response_model=UpsertResponse)
def upsert_vectors(req: UpsertRequest):
    """Add or update vectors in a collection."""
    if req.collection not in _collections:
        raise HTTPException(
            status_code=404, detail=f"Collection '{req.collection}' not found"
        )

    col = _collections[req.collection]

    vectors: List[Vector] = []
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
            raise HTTPException(status_code=400, detail=str(e))

    try:
        ids = col.add(vectors)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Auto-save if enabled
    _auto_save_collection(req.collection)

    return UpsertResponse(ids=ids, count=len(ids))


@app.post("/vectors/search", response_model=SearchResponse)
def search_vectors(req: SearchRequest):
    """Search for nearest-neighbor vectors."""
    if req.collection not in _collections:
        raise HTTPException(
            status_code=404, detail=f"Collection '{req.collection}' not found"
        )

    col = _collections[req.collection]

    if len(req.vector) != col.dimension:
        raise HTTPException(
            status_code=400,
            detail=f"Query dimension {len(req.vector)} doesn't match "
                   f"collection dimension {col.dimension}",
        )

    results = col.search(req.vector, k=req.k)

    matches: List[SearchMatch] = []
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


@app.get("/vectors/{collection}/{vector_id}", response_model=VectorResponse)
def get_vector(collection: str, vector_id: str):
    """Get a specific vector by ID."""
    if collection not in _collections:
        raise HTTPException(
            status_code=404, detail=f"Collection '{collection}' not found"
        )

    vec = _collections[collection].get(vector_id)
    if vec is None:
        raise HTTPException(
            status_code=404, detail=f"Vector '{vector_id}' not found"
        )

    return VectorResponse(
        id=vec.id,
        values=vec.embedding.tolist(),
        metadata=vec.metadata,
        collection=vec.collection,
        dimension=vec.dimension,
    )


@app.delete("/vectors/{collection}/{vector_id}", status_code=200)
def delete_vector(collection: str, vector_id: str):
    """Delete a vector by ID."""
    if collection not in _collections:
        raise HTTPException(
            status_code=404, detail=f"Collection '{collection}' not found"
        )

    removed = _collections[collection].delete(vector_id)
    if not removed:
        raise HTTPException(
            status_code=404, detail=f"Vector '{vector_id}' not found"
        )

    # Auto-save if enabled
    _auto_save_collection(collection)

    return {"message": f"Vector '{vector_id}' deleted"}


# ---------------------------------------------------------------------------
# Persistence endpoints
# ---------------------------------------------------------------------------


@app.post("/collections/{name}/save", response_model=SaveCollectionResponse)
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
        raise HTTPException(status_code=500, detail=f"Failed to save collection: {str(e)}")


@app.post("/collections/load", response_model=LoadCollectionResponse)
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
            message=f"Collection loaded successfully",
            collection=col.name,
            vector_count=col.count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load collection: {str(e)}")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
def health_check():
    """System health check."""
    total = sum(col.count for col in _collections.values())
    return HealthResponse(
        status="ok",
        version="0.1.0",
        collections=len(_collections),
        total_vectors=total,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# Embedding model (lazy-loaded)
# ---------------------------------------------------------------------------

_embedding_model = None
_embedding_model_name: Optional[str] = None


def _get_embedding_model(model_name: str = "all-MiniLM-L6-v2"):
    global _embedding_model, _embedding_model_name
    if _embedding_model is None or _embedding_model_name != model_name:
        try:
            from sentence_transformers import SentenceTransformer
            print(f"🔄 Loading embedding model '{model_name}'...")
            _embedding_model = SentenceTransformer(model_name)
            _embedding_model_name = model_name
            print(f"✅ Embedding model '{model_name}' loaded.")
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail=(
                    "sentence-transformers is not installed. "
                    "Run: pip install sentence-transformers"
                ),
            )
    return _embedding_model


# ---------------------------------------------------------------------------
# Embedding endpoints
# ---------------------------------------------------------------------------


@app.post("/embed", response_model=EmbedResponse)
def embed_texts(req: EmbedRequest):
    """Embed a list of texts using a sentence transformer model."""
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts list must not be empty")
    model = _get_embedding_model(req.model)
    try:
        embeddings = model.encode(req.texts, convert_to_numpy=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")
    return EmbedResponse(
        embeddings=embeddings.tolist(),
        dimension=int(embeddings.shape[1]),
        model=req.model,
        count=len(req.texts),
    )


@app.post("/vectors/embed-upsert", response_model=UpsertResponse)
def embed_upsert_vectors(req: EmbedUpsertRequest):
    """Embed texts and upsert the resulting vectors into a collection."""
    if req.collection not in _collections:
        raise HTTPException(
            status_code=404, detail=f"Collection '{req.collection}' not found"
        )
    col = _collections[req.collection]

    model = _get_embedding_model(req.model)
    texts = [item.text for item in req.texts]
    try:
        embeddings = model.encode(texts, convert_to_numpy=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

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

    vectors: List[Vector] = []
    for i, item in enumerate(req.texts):
        meta = {**item.metadata, "text": item.text, "label": item.text[:80]}
        vec = Vector(embedding=embeddings[i], metadata=meta)
        if item.id:
            vec.id = item.id
        vectors.append(vec)

    try:
        ids = col.add(vectors)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _auto_save_collection(req.collection)
    return UpsertResponse(ids=ids, count=len(ids))


# ---------------------------------------------------------------------------
# Visualization endpoint
# ---------------------------------------------------------------------------


@app.post("/collections/{name}/visualize", response_model=VisualizeResponse)
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
            total_var = float(np.sum(S ** 2))
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
