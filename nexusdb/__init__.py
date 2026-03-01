"""NexusDB — A vector database built from scratch."""

__version__ = "0.1.0"

from nexusdb.core.vector import Vector
from nexusdb.core.collection import Collection
from nexusdb.core.index.flat_index import FlatIndex

__all__ = ["Vector", "Collection", "FlatIndex"]
