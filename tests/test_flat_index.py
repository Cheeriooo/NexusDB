"""Tests for the FlatIndex (brute-force) search."""

import numpy as np
import pytest

from nexusdb.core.index.flat_index import FlatIndex, SearchResult
from nexusdb.core.vector import Vector


def _make_vectors(n: int, dim: int = 4) -> list[Vector]:
    """Generate n random vectors of the given dimension."""
    rng = np.random.default_rng(42)
    return [
        Vector(
            embedding=rng.random(dim).astype(np.float32),
            id=f"vec-{i}",
            metadata={"index": i},
        )
        for i in range(n)
    ]


class TestFlatIndexBasic:

    def test_create(self):
        idx = FlatIndex(dimension=128, metric="cosine")
        assert idx.dimension == 128
        assert idx.size == 0

    def test_invalid_dimension(self):
        with pytest.raises(ValueError):
            FlatIndex(dimension=0)

    def test_add_single(self):
        idx = FlatIndex(dimension=3)
        v = Vector(embedding=[1.0, 2.0, 3.0], id="v1")
        ids = idx.add([v])
        assert ids == ["v1"]
        assert idx.size == 1

    def test_add_dimension_mismatch(self):
        idx = FlatIndex(dimension=3)
        v = Vector(embedding=[1.0, 2.0], id="bad")
        with pytest.raises(ValueError, match="dimension"):
            idx.add([v])

    def test_get(self):
        idx = FlatIndex(dimension=2)
        v = Vector(embedding=[1.0, 0.0], id="v1")
        idx.add([v])
        result = idx.get("v1")
        assert result is not None
        assert result.id == "v1"

    def test_get_missing(self):
        idx = FlatIndex(dimension=2)
        assert idx.get("nonexistent") is None

    def test_remove(self):
        idx = FlatIndex(dimension=2)
        v = Vector(embedding=[1.0, 0.0], id="v1")
        idx.add([v])
        assert idx.remove("v1") is True
        assert idx.size == 0
        assert idx.get("v1") is None

    def test_remove_missing(self):
        idx = FlatIndex(dimension=2)
        assert idx.remove("nonexistent") is False

    def test_clear(self):
        idx = FlatIndex(dimension=2)
        idx.add(_make_vectors(10, dim=2))
        idx.clear()
        assert idx.size == 0

    def test_upsert(self):
        idx = FlatIndex(dimension=2)
        v1 = Vector(embedding=[1.0, 0.0], id="v1", metadata={"version": 1})
        idx.add([v1])
        v1_updated = Vector(embedding=[0.0, 1.0], id="v1", metadata={"version": 2})
        idx.add([v1_updated])
        assert idx.size == 1
        result = idx.get("v1")
        assert result.metadata["version"] == 2


class TestFlatIndexSearch:

    def test_search_cosine_nearest(self):
        idx = FlatIndex(dimension=2, metric="cosine")
        idx.add([
            Vector(embedding=[1.0, 0.0], id="right"),
            Vector(embedding=[0.0, 1.0], id="up"),
            Vector(embedding=[-1.0, 0.0], id="left"),
        ])
        query = np.array([0.9, 0.1], dtype=np.float32)
        results = idx.search(query, k=1)
        assert len(results) == 1
        assert results[0].id == "right"

    def test_search_euclidean(self):
        idx = FlatIndex(dimension=2, metric="euclidean")
        idx.add([
            Vector(embedding=[0.0, 0.0], id="origin"),
            Vector(embedding=[10.0, 10.0], id="far"),
        ])
        query = np.array([1.0, 1.0], dtype=np.float32)
        results = idx.search(query, k=1)
        assert results[0].id == "origin"

    def test_search_dot_product(self):
        idx = FlatIndex(dimension=2, metric="dot")
        idx.add([
            Vector(embedding=[1.0, 0.0], id="a"),
            Vector(embedding=[0.0, 1.0], id="b"),
        ])
        query = np.array([5.0, 0.0], dtype=np.float32)
        results = idx.search(query, k=1)
        assert results[0].id == "a"

    def test_search_returns_k(self):
        idx = FlatIndex(dimension=4, metric="cosine")
        vectors = _make_vectors(100, dim=4)
        idx.add(vectors)
        results = idx.search(np.random.rand(4).astype(np.float32), k=10)
        assert len(results) == 10

    def test_search_k_larger_than_index(self):
        idx = FlatIndex(dimension=2)
        idx.add([Vector(embedding=[1.0, 0.0], id="only")])
        results = idx.search(np.array([1.0, 0.0], dtype=np.float32), k=100)
        assert len(results) == 1

    def test_search_empty_index(self):
        idx = FlatIndex(dimension=2)
        results = idx.search(np.array([1.0, 0.0], dtype=np.float32), k=5)
        assert results == []

    def test_search_wrong_dimension(self):
        idx = FlatIndex(dimension=3)
        with pytest.raises(ValueError, match="dimension"):
            idx.search(np.array([1.0, 0.0], dtype=np.float32), k=1)

    def test_search_results_sorted(self):
        idx = FlatIndex(dimension=2, metric="euclidean")
        idx.add([
            Vector(embedding=[10.0, 0.0], id="far"),
            Vector(embedding=[1.0, 0.0], id="near"),
            Vector(embedding=[5.0, 0.0], id="mid"),
        ])
        query = np.array([0.0, 0.0], dtype=np.float32)
        results = idx.search(query, k=3)
        assert results[0].id == "near"
        assert results[1].id == "mid"
        assert results[2].id == "far"

    def test_search_with_filter(self):
        idx = FlatIndex(dimension=2, metric="euclidean")
        idx.add([
            Vector(embedding=[1.0, 0.0], id="a"),
            Vector(embedding=[0.0, 1.0], id="b"),
            Vector(embedding=[0.5, 0.5], id="c"),
        ])
        query = np.array([1.0, 0.0], dtype=np.float32)
        results = idx.search(query, k=1, ids_filter={"b", "c"})
        assert results[0].id == "c"


class TestFlatIndexScale:
    """Verify the index works with larger datasets."""

    def test_10k_vectors(self):
        dim = 128
        n = 10_000
        idx = FlatIndex(dimension=dim, metric="cosine")
        vectors = _make_vectors(n, dim=dim)
        idx.add(vectors)
        assert idx.size == n

        query = np.random.rand(dim).astype(np.float32)
        results = idx.search(query, k=10)
        assert len(results) == 10
        # Distances should be non-decreasing
        for i in range(len(results) - 1):
            assert results[i].distance <= results[i + 1].distance + 1e-6
