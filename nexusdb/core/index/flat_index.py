"""Flat (brute-force) index for exact nearest-neighbor search."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

from nexusdb.core.vector import Vector
from nexusdb.utils.distance import get_distance_fn


@dataclass
class SearchResult:
    """A single search result."""

    id: str
    distance: float
    vector: Optional[Vector] = None


class FlatIndex:
    """In-memory brute-force vector index.

    Stores all vectors in a dense numpy matrix and computes exact
    nearest neighbors via exhaustive distance computation.

    Args:
        dimension: Dimensionality of vectors in this index.
        metric: Distance metric — 'cosine', 'euclidean', or 'dot'.
    """

    def __init__(self, dimension: int, metric: str = "cosine") -> None:
        if dimension <= 0:
            raise ValueError(f"dimension must be positive, got {dimension}")

        self.dimension = dimension
        self.metric = metric
        self._distance_fn = get_distance_fn(metric)

        # Storage
        self._vectors: Dict[str, Vector] = {}   # id → Vector
        self._matrix: Optional[np.ndarray] = None  # (N, D) dense matrix
        self._id_list: List[str] = []            # ordered list of IDs matching matrix rows

        self._lock = threading.Lock()
        self._dirty = False  # True when _matrix needs rebuild

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def size(self) -> int:
        """Number of vectors in the index."""
        return len(self._vectors)

    def add(self, vectors: List[Vector]) -> List[str]:
        """Add vectors to the index. If a vector with the same ID exists, it is updated.

        Args:
            vectors: List of Vector objects to add.

        Returns:
            List of IDs that were added/updated.

        Raises:
            ValueError: If any vector has a mismatched dimension.
        """
        ids: List[str] = []
        with self._lock:
            for vec in vectors:
                if vec.dimension != self.dimension:
                    raise ValueError(
                        f"Vector '{vec.id}' has dimension {vec.dimension}, "
                        f"expected {self.dimension}"
                    )
                self._vectors[vec.id] = vec
                ids.append(vec.id)
                self._dirty = True
        return ids

    def get(self, vector_id: str) -> Optional[Vector]:
        """Retrieve a vector by its ID."""
        return self._vectors.get(vector_id)

    def remove(self, vector_id: str) -> bool:
        """Remove a vector by its ID.

        Returns:
            True if the vector was found and removed, False otherwise.
        """
        with self._lock:
            if vector_id in self._vectors:
                del self._vectors[vector_id]
                self._dirty = True
                return True
            return False

    def search(
        self,
        query: np.ndarray,
        k: int = 10,
        ids_filter: Optional[set] = None,
    ) -> List[SearchResult]:
        """Find the k nearest neighbors to the query vector.

        Args:
            query: Query vector of shape (D,).
            k: Number of results to return.
            ids_filter: If provided, only search within these vector IDs.

        Returns:
            List of SearchResult sorted by distance (ascending).
        """
        if query.ndim != 1 or len(query) != self.dimension:
            raise ValueError(
                f"Query must be 1D with dimension {self.dimension}, "
                f"got shape {query.shape}"
            )

        with self._lock:
            if self._dirty or self._matrix is None:
                self._rebuild_matrix()

            if self._matrix is None or len(self._id_list) == 0:
                return []

            matrix = self._matrix
            id_list = self._id_list

        # Apply ID filter
        if ids_filter is not None:
            mask = np.array([vid in ids_filter for vid in id_list])
            if not mask.any():
                return []
            matrix = matrix[mask]
            id_list = [vid for vid, m in zip(id_list, mask) if m]

        # Compute distances
        distances = self._distance_fn(query.astype(np.float32), matrix)

        # Get top-k
        k = min(k, len(id_list))
        if k <= 0:
            return []

        if k >= len(id_list):
            # No need to partition — just sort everything
            top_k_indices = np.argsort(distances)[:k]
        else:
            top_k_indices = np.argpartition(distances, k)[:k]
            top_k_indices = top_k_indices[np.argsort(distances[top_k_indices])]

        results: List[SearchResult] = []
        for idx in top_k_indices:
            vid = id_list[idx]
            results.append(
                SearchResult(
                    id=vid,
                    distance=float(distances[idx]),
                    vector=self._vectors.get(vid),
                )
            )

        return results

    def clear(self) -> None:
        """Remove all vectors from the index."""
        with self._lock:
            self._vectors.clear()
            self._matrix = None
            self._id_list.clear()
            self._dirty = False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _rebuild_matrix(self) -> None:
        """Rebuild the dense matrix from stored vectors."""
        if len(self._vectors) == 0:
            self._matrix = None
            self._id_list = []
            self._dirty = False
            return

        self._id_list = list(self._vectors.keys())
        self._matrix = np.vstack(
            [self._vectors[vid].embedding for vid in self._id_list]
        ).astype(np.float32)
        self._dirty = False
