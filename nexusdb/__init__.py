"""NexusDB — A vector database built from scratch."""

__version__ = "0.1.0"

from nexusdb.core.collection import Collection
from nexusdb.core.index.base import Index
from nexusdb.core.index.flat_index import FlatIndex
from nexusdb.core.index.hnsw_index import HNSWIndex
from nexusdb.core.vector import Vector

__all__ = ["Vector", "Collection", "Index", "FlatIndex", "HNSWIndex"]
