"""Collection — a named group of vectors sharing the same dimension and metric."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from nexusdb.core.index.flat_index import FlatIndex, SearchResult
from nexusdb.core.vector import Vector


class Collection:
    """A named collection of vectors.

    Each collection enforces a fixed dimensionality and distance metric.
    Vectors within a collection are managed through an underlying index.

    Args:
        name: Unique name for this collection.
        dimension: Dimensionality of vectors.
        metric: Distance metric ('cosine', 'euclidean', 'dot').
    """

    def __init__(
        self,
        name: str,
        dimension: int,
        metric: str = "cosine",
    ) -> None:
        if not name or not name.strip():
            raise ValueError("Collection name must not be empty")
        if dimension <= 0:
            raise ValueError(f"dimension must be positive, got {dimension}")

        self.name = name.strip()
        self.dimension = dimension
        self.metric = metric
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = self.created_at

        self._index = FlatIndex(dimension=dimension, metric=metric)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # CRUD Operations
    # ------------------------------------------------------------------

    def add(self, vectors: List[Vector]) -> List[str]:
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
            self.updated_at = datetime.now(timezone.utc)
        return ids

    def get(self, vector_id: str) -> Optional[Vector]:
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
                self.updated_at = datetime.now(timezone.utc)
            return removed

    def search(
        self,
        query: List[float] | np.ndarray,
        k: int = 10,
    ) -> List[SearchResult]:
        """Search for nearest neighbors.

        Args:
            query: Query vector (list or numpy array).
            k: Number of neighbors to return.

        Returns:
            List of SearchResult ordered by distance (ascending).
        """
        if isinstance(query, (list, tuple)):
            query = np.array(query, dtype=np.float32)
        return self._index.search(query, k=k)

    # ------------------------------------------------------------------
    # Info
    # ------------------------------------------------------------------

    @property
    def count(self) -> int:
        """Number of vectors in this collection."""
        return self._index.size

    def info(self) -> Dict[str, Any]:
        """Return metadata about this collection."""
        return {
            "name": self.name,
            "dimension": self.dimension,
            "metric": self.metric,
            "count": self.count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def clear(self) -> None:
        """Remove all vectors from this collection."""
        with self._lock:
            self._index.clear()
            self.updated_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return (
            f"Collection(name='{self.name}', dim={self.dimension}, "
            f"metric='{self.metric}', count={self.count})"
        )
