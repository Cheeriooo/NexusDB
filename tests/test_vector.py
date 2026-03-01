"""Tests for the Vector data model."""

import uuid

import numpy as np
import pytest

from nexusdb.core.vector import Vector


class TestVectorCreation:
    """Test vector instantiation and validation."""

    def test_create_from_list(self):
        v = Vector(embedding=[1.0, 2.0, 3.0])
        assert v.dimension == 3
        assert isinstance(v.embedding, np.ndarray)
        assert v.embedding.dtype == np.float32
        np.testing.assert_array_almost_equal(v.embedding, [1.0, 2.0, 3.0])

    def test_create_from_numpy(self):
        arr = np.array([0.5, 0.6, 0.7], dtype=np.float64)
        v = Vector(embedding=arr)
        assert v.embedding.dtype == np.float32
        assert v.dimension == 3

    def test_auto_generated_id(self):
        v = Vector(embedding=[1.0, 2.0])
        # Should be a valid UUID
        uuid.UUID(v.id)

    def test_custom_id(self):
        v = Vector(embedding=[1.0], id="my-custom-id")
        assert v.id == "my-custom-id"

    def test_metadata(self):
        v = Vector(embedding=[1.0], metadata={"key": "value", "num": 42})
        assert v.metadata == {"key": "value", "num": 42}

    def test_collection_assignment(self):
        v = Vector(embedding=[1.0], collection="test-collection")
        assert v.collection == "test-collection"

    def test_timestamp_auto(self):
        v = Vector(embedding=[1.0])
        assert v.timestamp is not None

    def test_empty_embedding_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            Vector(embedding=[])

    def test_2d_embedding_raises(self):
        with pytest.raises(ValueError, match="1-dimensional"):
            Vector(embedding=np.array([[1.0, 2.0], [3.0, 4.0]]))

    def test_invalid_type_raises(self):
        with pytest.raises(TypeError, match="must be a list"):
            Vector(embedding="not a vector")


class TestVectorSerialization:
    """Test to_dict / from_dict round-trip."""

    def test_round_trip(self):
        original = Vector(
            embedding=[0.1, 0.2, 0.3],
            id="test-id",
            metadata={"label": "test"},
            collection="my-col",
        )
        data = original.to_dict()
        restored = Vector.from_dict(data)

        assert restored.id == original.id
        assert restored.collection == original.collection
        assert restored.metadata == original.metadata
        assert restored.dimension == original.dimension
        np.testing.assert_array_almost_equal(
            restored.embedding, original.embedding
        )

    def test_to_dict_fields(self):
        v = Vector(embedding=[1.0, 2.0], id="abc")
        d = v.to_dict()
        assert d["id"] == "abc"
        assert d["dimension"] == 2
        assert isinstance(d["embedding"], list)
        assert isinstance(d["timestamp"], str)

    def test_from_dict_auto_id(self):
        v = Vector.from_dict({"embedding": [1.0]})
        uuid.UUID(v.id)  # should be valid UUID

    def test_repr(self):
        v = Vector(embedding=[1.0, 2.0], id="test", collection="col")
        r = repr(v)
        assert "test" in r
        assert "col" in r
        assert "2" in r  # dimension
