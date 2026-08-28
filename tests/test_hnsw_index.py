"""Tests for the HNSW (approximate) index."""

import numpy as np
import pytest

from nexusdb.core.index.flat_index import FlatIndex
from nexusdb.core.index.hnsw_index import HNSWIndex
from nexusdb.core.vector import Vector


def _make_vectors(n: int, dim: int = 8, seed: int = 42) -> list[Vector]:
    rng = np.random.default_rng(seed)
    return [
        Vector(
            embedding=rng.standard_normal(dim).astype(np.float32),
            id=f"vec-{i}",
            metadata={"index": i},
        )
        for i in range(n)
    ]


class TestHNSWIndexBasic:

    def test_create(self):
        idx = HNSWIndex(dimension=128, metric="cosine")
        assert idx.dimension == 128
        assert idx.size == 0

    def test_invalid_dimension(self):
        with pytest.raises(ValueError):
            HNSWIndex(dimension=0)

    def test_invalid_m(self):
        with pytest.raises(ValueError, match="m must be"):
            HNSWIndex(dimension=8, m=1)

    def test_invalid_metric(self):
        with pytest.raises(ValueError, match="Unknown metric"):
            HNSWIndex(dimension=8, metric="manhattan")

    def test_invalid_rebuild_threshold(self):
        with pytest.raises(ValueError, match="rebuild_threshold"):
            HNSWIndex(dimension=8, rebuild_threshold=0)

    def test_add_single(self):
        idx = HNSWIndex(dimension=3)
        v = Vector(embedding=[1.0, 2.0, 3.0], id="v1")
        ids = idx.add([v])
        assert ids == ["v1"]
        assert idx.size == 1

    def test_add_dimension_mismatch(self):
        idx = HNSWIndex(dimension=3)
        v = Vector(embedding=[1.0, 2.0], id="bad")
        with pytest.raises(ValueError, match="dimension"):
            idx.add([v])

    def test_get(self):
        idx = HNSWIndex(dimension=2)
        idx.add([Vector(embedding=[1.0, 0.0], id="v1")])
        result = idx.get("v1")
        assert result is not None
        assert result.id == "v1"

    def test_get_missing(self):
        idx = HNSWIndex(dimension=2)
        assert idx.get("nonexistent") is None

    def test_remove(self):
        idx = HNSWIndex(dimension=2)
        idx.add([Vector(embedding=[1.0, 0.0], id="v1")])
        assert idx.remove("v1") is True
        assert idx.size == 0
        assert idx.get("v1") is None

    def test_remove_missing(self):
        idx = HNSWIndex(dimension=2)
        assert idx.remove("nonexistent") is False

    def test_clear(self):
        idx = HNSWIndex(dimension=8)
        idx.add(_make_vectors(20, dim=8))
        idx.clear()
        assert idx.size == 0
        assert idx.search(np.zeros(8, dtype=np.float32), k=5) == []

    def test_upsert_updates_metadata_and_position(self):
        idx = HNSWIndex(dimension=2, m=4, ef_construction=20)
        idx.add([Vector(embedding=[1.0, 0.0], id="v1", metadata={"version": 1})])
        idx.add([Vector(embedding=[0.0, 1.0], id="v1", metadata={"version": 2})])
        assert idx.size == 1
        result = idx.get("v1")
        assert result.metadata["version"] == 2
        np.testing.assert_allclose(result.embedding, [0.0, 1.0])


class TestHNSWIndexSearch:

    def test_search_cosine_nearest(self):
        idx = HNSWIndex(dimension=2, metric="cosine", m=4, ef_construction=20)
        idx.add(
            [
                Vector(embedding=[1.0, 0.0], id="right"),
                Vector(embedding=[0.0, 1.0], id="up"),
                Vector(embedding=[-1.0, 0.0], id="left"),
            ]
        )
        results = idx.search(np.array([0.9, 0.1], dtype=np.float32), k=1)
        assert len(results) == 1
        assert results[0].id == "right"

    def test_search_euclidean(self):
        idx = HNSWIndex(dimension=2, metric="euclidean", m=4, ef_construction=20)
        idx.add(
            [
                Vector(embedding=[0.0, 0.0], id="origin"),
                Vector(embedding=[10.0, 10.0], id="far"),
            ]
        )
        results = idx.search(np.array([1.0, 1.0], dtype=np.float32), k=1)
        assert results[0].id == "origin"

    def test_search_dot_product(self):
        idx = HNSWIndex(dimension=2, metric="dot", m=4, ef_construction=20)
        idx.add(
            [
                Vector(embedding=[1.0, 0.0], id="a"),
                Vector(embedding=[0.0, 1.0], id="b"),
            ]
        )
        results = idx.search(np.array([5.0, 0.0], dtype=np.float32), k=1)
        assert results[0].id == "a"

    def test_search_returns_k(self):
        idx = HNSWIndex(dimension=8, m=8, ef_construction=50)
        idx.add(_make_vectors(200, dim=8))
        results = idx.search(np.random.rand(8).astype(np.float32), k=10)
        assert len(results) == 10

    def test_search_k_larger_than_index(self):
        idx = HNSWIndex(dimension=2)
        idx.add([Vector(embedding=[1.0, 0.0], id="only")])
        results = idx.search(np.array([1.0, 0.0], dtype=np.float32), k=100)
        assert len(results) == 1

    def test_search_empty_index(self):
        idx = HNSWIndex(dimension=2)
        results = idx.search(np.array([1.0, 0.0], dtype=np.float32), k=5)
        assert results == []

    def test_search_k_zero_or_negative(self):
        idx = HNSWIndex(dimension=2)
        idx.add([Vector(embedding=[1.0, 0.0], id="v1")])
        assert idx.search(np.array([1.0, 0.0], dtype=np.float32), k=0) == []

    def test_search_wrong_dimension(self):
        idx = HNSWIndex(dimension=3)
        with pytest.raises(ValueError, match="dimension"):
            idx.search(np.array([1.0, 0.0], dtype=np.float32), k=1)

    def test_search_results_sorted(self):
        idx = HNSWIndex(dimension=2, metric="euclidean", m=4, ef_construction=20)
        idx.add(
            [
                Vector(embedding=[10.0, 0.0], id="far"),
                Vector(embedding=[1.0, 0.0], id="near"),
                Vector(embedding=[5.0, 0.0], id="mid"),
            ]
        )
        results = idx.search(np.array([0.0, 0.0], dtype=np.float32), k=3)
        assert [r.id for r in results] == ["near", "mid", "far"]

    def test_search_with_filter(self):
        idx = HNSWIndex(dimension=2, metric="euclidean", m=4, ef_construction=20)
        idx.add(
            [
                Vector(embedding=[1.0, 0.0], id="a"),
                Vector(embedding=[0.0, 1.0], id="b"),
                Vector(embedding=[0.5, 0.5], id="c"),
            ]
        )
        results = idx.search(np.array([1.0, 0.0], dtype=np.float32), k=1, ids_filter={"b", "c"})
        assert results[0].id == "c"

    def test_ef_search_override(self):
        idx = HNSWIndex(dimension=8, m=8, ef_construction=50, ef_search=1)
        idx.add(_make_vectors(300, dim=8))
        query = np.random.default_rng(0).standard_normal(8).astype(np.float32)
        # A much larger ef_search should be able to return more candidates
        # from the same graph without raising.
        results = idx.search(query, k=20, ef_search=100)
        assert len(results) == 20


class TestHNSWIndexRecallAgainstFlat:
    """The whole point of HNSW is to approximate FlatIndex — verify it does."""

    def test_high_recall_at_reasonable_ef(self):
        dim = 16
        vectors = _make_vectors(500, dim=dim, seed=7)

        flat = FlatIndex(dimension=dim, metric="cosine")
        flat.add(vectors)

        hnsw = HNSWIndex(
            dimension=dim, metric="cosine", m=16, ef_construction=100, ef_search=100, seed=7
        )
        hnsw.add(vectors)

        rng = np.random.default_rng(123)
        k = 10
        recalls = []
        for _ in range(20):
            query = rng.standard_normal(dim).astype(np.float32)
            exact = {r.id for r in flat.search(query, k=k)}
            approx = {r.id for r in hnsw.search(query, k=k)}
            recalls.append(len(exact & approx) / k)

        assert np.mean(recalls) >= 0.9


class TestHNSWIndexScale:

    def test_1k_vectors_build_and_search(self):
        dim = 32
        n = 1000
        idx = HNSWIndex(dimension=dim, metric="cosine", m=8, ef_construction=40)
        idx.add(_make_vectors(n, dim=dim))
        assert idx.size == n

        results = idx.search(np.random.rand(dim).astype(np.float32), k=10)
        assert len(results) == 10
        for i in range(len(results) - 1):
            assert results[i].distance <= results[i + 1].distance + 1e-6


class TestHNSWIndexSoftDeleteAndRebuild:

    def test_removed_vector_not_returned(self):
        idx = HNSWIndex(dimension=8, m=8, ef_construction=40, rebuild_threshold=0.9)
        vectors = _make_vectors(50, dim=8)
        idx.add(vectors)
        idx.remove("vec-0")

        results = idx.search(np.random.rand(8).astype(np.float32), k=50)
        assert "vec-0" not in {r.id for r in results}
        assert idx.size == 49

    def test_rebuild_triggers_past_threshold(self):
        idx = HNSWIndex(dimension=8, m=8, ef_construction=40, rebuild_threshold=0.3)
        vectors = _make_vectors(20, dim=8)
        idx.add(vectors)

        for i in range(7):  # 7/20 = 0.35 >= 0.3 threshold
            idx.remove(f"vec-{i}")

        # A successful rebuild means the graph is still fully searchable and
        # contains no tombstoned survivors.
        assert idx.size == 13
        results = idx.search(np.random.rand(8).astype(np.float32), k=13)
        assert len(results) == 13
        returned_ids = {r.id for r in results}
        assert returned_ids.isdisjoint({f"vec-{i}" for i in range(7)})

    def test_repeated_upsert_of_same_id_does_not_leak_graph_nodes(self):
        """Re-upserting one id many times (no explicit remove()) must still
        trip rebuild_threshold via the tombstones it creates internally —
        otherwise _levels/_graph grow unboundedly while size stays at 1."""
        idx = HNSWIndex(dimension=4, m=4, ef_construction=20, rebuild_threshold=0.3)
        rng = np.random.default_rng(0)
        for _ in range(200):
            idx.add([Vector(embedding=rng.standard_normal(4).astype(np.float32), id="doc")])

        assert idx.size == 1
        assert len(idx._levels) < 200

    def test_entry_point_removed_search_still_works(self):
        idx = HNSWIndex(dimension=8, m=8, ef_construction=40, rebuild_threshold=1.0)
        vectors = _make_vectors(30, dim=8)
        idx.add(vectors)

        # Remove whatever node is currently the entry point and make sure
        # search still finds a full result set afterward.
        idx.remove(idx._entry_point)
        results = idx.search(np.random.rand(8).astype(np.float32), k=10)
        assert len(results) == 10

    def test_remove_all_then_add_again(self):
        idx = HNSWIndex(dimension=4, m=4, ef_construction=20, rebuild_threshold=1.0)
        vectors = _make_vectors(5, dim=4)
        idx.add(vectors)
        for v in vectors:
            idx.remove(v.id)

        assert idx.size == 0
        idx.add([Vector(embedding=[1.0, 0.0, 0.0, 0.0], id="fresh")])
        results = idx.search(np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32), k=1)
        assert results[0].id == "fresh"
