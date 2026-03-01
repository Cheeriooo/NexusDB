"""Tests for the Collection class."""

import numpy as np
import pytest

from nexusdb.core.collection import Collection
from nexusdb.core.vector import Vector


class TestCollectionCreation:

    def test_create(self):
        col = Collection(name="test", dimension=128)
        assert col.name == "test"
        assert col.dimension == 128
        assert col.metric == "cosine"
        assert col.count == 0

    def test_empty_name_raises(self):
        with pytest.raises(ValueError, match="name"):
            Collection(name="", dimension=128)

    def test_invalid_dimension_raises(self):
        with pytest.raises(ValueError, match="dimension"):
            Collection(name="test", dimension=-1)

    def test_info(self):
        col = Collection(name="docs", dimension=768, metric="euclidean")
        info = col.info()
        assert info["name"] == "docs"
        assert info["dimension"] == 768
        assert info["metric"] == "euclidean"
        assert info["count"] == 0
        assert "created_at" in info
        assert "updated_at" in info


class TestCollectionCRUD:

    def test_add_vectors(self):
        col = Collection(name="test", dimension=3)
        vectors = [
            Vector(embedding=[1.0, 0.0, 0.0], id="v1"),
            Vector(embedding=[0.0, 1.0, 0.0], id="v2"),
        ]
        ids = col.add(vectors)
        assert ids == ["v1", "v2"]
        assert col.count == 2

    def test_add_sets_collection_name(self):
        col = Collection(name="my-col", dimension=2)
        v = Vector(embedding=[1.0, 0.0])
        col.add([v])
        assert v.collection == "my-col"

    def test_get_vector(self):
        col = Collection(name="test", dimension=2)
        v = Vector(embedding=[1.0, 0.0], id="v1")
        col.add([v])
        result = col.get("v1")
        assert result is not None
        assert result.id == "v1"

    def test_get_missing(self):
        col = Collection(name="test", dimension=2)
        assert col.get("nope") is None

    def test_delete_vector(self):
        col = Collection(name="test", dimension=2)
        v = Vector(embedding=[1.0, 0.0], id="v1")
        col.add([v])
        assert col.delete("v1") is True
        assert col.count == 0

    def test_delete_missing(self):
        col = Collection(name="test", dimension=2)
        assert col.delete("nope") is False

    def test_clear(self):
        col = Collection(name="test", dimension=2)
        col.add([
            Vector(embedding=[1.0, 0.0], id="v1"),
            Vector(embedding=[0.0, 1.0], id="v2"),
        ])
        col.clear()
        assert col.count == 0


class TestCollectionSearch:

    def test_search_basic(self):
        col = Collection(name="test", dimension=2, metric="cosine")
        col.add([
            Vector(embedding=[1.0, 0.0], id="right"),
            Vector(embedding=[0.0, 1.0], id="up"),
        ])
        results = col.search([0.9, 0.1], k=1)
        assert len(results) == 1
        assert results[0].id == "right"

    def test_search_with_list_query(self):
        col = Collection(name="test", dimension=3, metric="euclidean")
        col.add([Vector(embedding=[0.0, 0.0, 0.0], id="origin")])
        results = col.search([1.0, 1.0, 1.0], k=1)
        assert results[0].id == "origin"

    def test_search_with_numpy_query(self):
        col = Collection(name="test", dimension=2)
        col.add([Vector(embedding=[1.0, 0.0], id="v1")])
        q = np.array([1.0, 0.0], dtype=np.float32)
        results = col.search(q, k=1)
        assert results[0].id == "v1"

    def test_search_empty_collection(self):
        col = Collection(name="test", dimension=2)
        results = col.search([1.0, 0.0], k=5)
        assert results == []
