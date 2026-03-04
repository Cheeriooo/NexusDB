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


class HealthResponse(BaseModel):
    status: str
    version: str
    collections: int
    total_vectors: int
    timestamp: str


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

    return {"message": f"Vector '{vector_id}' deleted"}


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
