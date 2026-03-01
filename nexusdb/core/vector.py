"""Vector data model for NexusDB."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np


@dataclass
class Vector:
    """Represents a single vector in the database.

    Attributes:
        id: Unique identifier (UUID string). Auto-generated if not provided.
        embedding: The vector values as a numpy array of float32.
        metadata: Arbitrary key-value metadata attached to the vector.
        timestamp: When the vector was created/updated (UTC).
        collection: Name of the collection this vector belongs to.
    """

    embedding: np.ndarray
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    collection: str = ""

    def __post_init__(self) -> None:
        """Validate and normalize the vector after initialization."""
        # Convert list/tuple to numpy array
        if isinstance(self.embedding, (list, tuple)):
            self.embedding = np.array(self.embedding, dtype=np.float32)
        elif isinstance(self.embedding, np.ndarray):
            self.embedding = self.embedding.astype(np.float32)
        else:
            raise TypeError(
                f"embedding must be a list, tuple, or numpy array, "
                f"got {type(self.embedding).__name__}"
            )

        # Validate dimensions
        if self.embedding.ndim != 1:
            raise ValueError(
                f"embedding must be 1-dimensional, got {self.embedding.ndim}D"
            )
        if len(self.embedding) == 0:
            raise ValueError("embedding must not be empty")

    @property
    def dimension(self) -> int:
        """Return the dimensionality of this vector."""
        return len(self.embedding)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the vector to a dictionary."""
        return {
            "id": self.id,
            "embedding": self.embedding.tolist(),
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
            "collection": self.collection,
            "dimension": self.dimension,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Vector:
        """Deserialize a vector from a dictionary."""
        embedding = np.array(data["embedding"], dtype=np.float32)
        timestamp = data.get("timestamp")
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        elif timestamp is None:
            timestamp = datetime.now(timezone.utc)

        return cls(
            id=data.get("id", str(uuid.uuid4())),
            embedding=embedding,
            metadata=data.get("metadata", {}),
            timestamp=timestamp,
            collection=data.get("collection", ""),
        )

    def __repr__(self) -> str:
        return (
            f"Vector(id='{self.id}', dim={self.dimension}, "
            f"collection='{self.collection}')"
        )
