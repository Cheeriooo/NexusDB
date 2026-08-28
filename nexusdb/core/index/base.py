"""Abstract base class every vector index implementation must satisfy.

`FlatIndex` (exact, brute-force) and `HNSWIndex` (approximate) both implement
this interface so `Collection` can swap between them per-collection via
`index_type`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

from nexusdb.core.vector import Vector


@dataclass
class SearchResult:
    """A single search result."""

    id: str
    distance: float
    vector: Vector | None = None


class Index(ABC):
    """Common interface for a per-collection vector index.

    Args:
        dimension: Dimensionality of vectors in this index.
        metric: Distance metric — 'cosine', 'euclidean'/'l2', or 'dot'/'inner_product'.
    """

    dimension: int
    metric: str

    @property
    @abstractmethod
    def size(self) -> int:
        """Number of vectors currently in the index."""

    @abstractmethod
    def add(self, vectors: list[Vector]) -> list[str]:
        """Add vectors to the index. If a vector with the same ID exists, it is updated.

        Returns:
            List of IDs that were added/updated.
        """

    @abstractmethod
    def get(self, vector_id: str) -> Vector | None:
        """Retrieve a vector by its ID, or None if not present."""

    @abstractmethod
    def remove(self, vector_id: str) -> bool:
        """Remove a vector by its ID. Returns True if it was found and removed."""

    @abstractmethod
    def search(
        self,
        query: np.ndarray,
        k: int = 10,
        ids_filter: set | None = None,
        ef_search: int | None = None,
    ) -> list[SearchResult]:
        """Find the k nearest neighbors to the query vector.

        Args:
            query: Query vector of shape (D,).
            k: Number of results to return.
            ids_filter: If provided, only consider these vector IDs.
            ef_search: Approximate indexes may accept this to override their
                default speed/recall tradeoff for a single query; exact
                indexes ignore it.

        Returns:
            List of SearchResult sorted by distance (ascending).
        """

    @abstractmethod
    def clear(self) -> None:
        """Remove all vectors from the index."""
