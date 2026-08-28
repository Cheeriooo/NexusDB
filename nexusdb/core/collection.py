"""Collection — a named group of vectors sharing the same dimension and metric."""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from nexusdb.core.index.base import Index, SearchResult
from nexusdb.core.index.flat_index import FlatIndex
from nexusdb.core.index.hnsw_index import HNSWIndex
from nexusdb.core.vector import Vector

# Registry of index implementations selectable via `index_type`.
_INDEX_REGISTRY: dict[str, type[Index]] = {
    "flat": FlatIndex,
    "hnsw": HNSWIndex,
}


class Collection:
    """A named collection of vectors.

    Each collection enforces a fixed dimensionality and distance metric.
    Vectors within a collection are managed through an underlying index.

    Args:
        name: Unique name for this collection.
        dimension: Dimensionality of vectors.
        metric: Distance metric ('cosine', 'euclidean', 'dot').
        index_type: Which index implementation to use — 'flat' (exact,
            brute-force) or 'hnsw' (approximate, faster at scale).
        index_params: Extra keyword arguments forwarded to the index
            constructor (e.g. `m`, `ef_construction` for 'hnsw').
    """

    def __init__(
        self,
        name: str,
        dimension: int,
        metric: str = "cosine",
        index_type: str = "flat",
        index_params: dict | None = None,
    ) -> None:
        if not name or not name.strip():
            raise ValueError("Collection name must not be empty")
        if dimension <= 0:
            raise ValueError(f"dimension must be positive, got {dimension}")

        index_cls = _INDEX_REGISTRY.get(index_type)
        if index_cls is None:
            raise ValueError(
                f"Unknown index_type '{index_type}'. Supported: {list(_INDEX_REGISTRY)}"
            )

        self.name = name.strip()
        self.dimension = dimension
        self.metric = metric
        self.index_type = index_type
        self.index_params = dict(index_params or {})
        self.created_at = datetime.now(UTC)
        self.updated_at = self.created_at

        self._index = index_cls(dimension=dimension, metric=metric, **self.index_params)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # CRUD Operations
    # ------------------------------------------------------------------

    def add(self, vectors: list[Vector]) -> list[str]:
        """Add (or upsert) vectors into this collection.

        Args:
            vectors: Vectors to add. Their `collection` field will be set
                     to this collection's name.

        Returns:
            List of added/updated vector IDs.
        """
        for vec in vectors:
            vec.collection = self.name
        with self._lock:
            ids = self._index.add(vectors)
            self.updated_at = datetime.now(UTC)
        return ids

    def get(self, vector_id: str) -> Vector | None:
        """Get a vector by ID."""
        return self._index.get(vector_id)

    def delete(self, vector_id: str) -> bool:
        """Delete a vector by ID.

        Returns:
            True if found and deleted.
        """
        with self._lock:
            removed = self._index.remove(vector_id)
            if removed:
                self.updated_at = datetime.now(UTC)
            return removed

    def search(
        self,
        query: list[float] | np.ndarray,
        k: int = 10,
        ef_search: int | None = None,
    ) -> list[SearchResult]:
        """Search for nearest neighbors.

        Args:
            query: Query vector (list or numpy array).
            k: Number of neighbors to return.
            ef_search: For an 'hnsw' collection, overrides the index's default
                speed/recall tradeoff for this query. Ignored for 'flat'.

        Returns:
            List of SearchResult ordered by distance (ascending).
        """
        if isinstance(query, (list, tuple)):
            query = np.array(query, dtype=np.float32)
        return self._index.search(query, k=k, ef_search=ef_search)

    # ------------------------------------------------------------------
    # Info
    # ------------------------------------------------------------------

    @property
    def count(self) -> int:
        """Number of vectors in this collection."""
        return self._index.size

    def info(self) -> dict[str, Any]:
        """Return metadata about this collection."""
        return {
            "name": self.name,
            "dimension": self.dimension,
            "metric": self.metric,
            "index_type": self.index_type,
            "count": self.count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def clear(self) -> None:
        """Remove all vectors from this collection."""
        with self._lock:
            self._index.clear()
            self.updated_at = datetime.now(UTC)

    def save(self, filepath: str | Path) -> None:
        """Save collection to SQLite database file.

        Args:
            filepath: Path to save the collection to.
        """
        from nexusdb.persistence import SQLiteBackend

        backend = SQLiteBackend(filepath)

        # Get all vectors from index
        vectors_to_save = list(self._index._vectors.values())

        backend.save_collection(
            collection_name=self.name,
            dimension=self.dimension,
            metric=self.metric,
            vectors=vectors_to_save,
            created_at=self.created_at.isoformat(),
            updated_at=self.updated_at.isoformat(),
            index_type=self.index_type,
            index_params=self.index_params,
        )

    @classmethod
    def load(cls, filepath: str | Path) -> Collection | None:
        """Load collection from SQLite database file.

        Args:
            filepath: Path to load the collection from.

        Returns:
            Collection object or None if file doesn't exist or is empty.
        """
        from nexusdb.persistence import SQLiteBackend

        filepath = Path(filepath)
        if not filepath.exists():
            return None

        backend = SQLiteBackend(filepath)
        collection_info, vectors = backend.load_collection()

        if collection_info is None:
            return None

        # Create collection
        collection = cls(
            name=collection_info["name"],
            dimension=collection_info["dimension"],
            metric=collection_info["metric"],
            index_type=collection_info.get("index_type", "flat"),
            index_params=collection_info.get("index_params") or {},
        )

        # Restore timestamps
        if collection_info["created_at"]:
            collection.created_at = datetime.fromisoformat(collection_info["created_at"])
        if collection_info["updated_at"]:
            collection.updated_at = datetime.fromisoformat(collection_info["updated_at"])

        # Add vectors back to collection
        if vectors:
            collection.add(vectors)

        return collection

    def __repr__(self) -> str:
        return (
            f"Collection(name='{self.name}', dim={self.dimension}, "
            f"metric='{self.metric}', count={self.count})"
        )
