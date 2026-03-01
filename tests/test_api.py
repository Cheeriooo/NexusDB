"""Integration tests for the FastAPI REST API."""

import pytest
from fastapi.testclient import TestClient

from nexusdb.api.server import app, _collections


@pytest.fixture(autouse=True)
def clean_collections():
    """Clear all collections before each test."""
    _collections.clear()
    yield
    _collections.clear()


client = TestClient(app)


# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------

class TestHealth:

    def test_health(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"
        assert data["collections"] == 0
        assert data["total_vectors"] == 0


# ------------------------------------------------------------------
# Collections
# ------------------------------------------------------------------

class TestCollections:

    def test_create_collection(self):
        r = client.post("/collections", json={
            "name": "docs",
            "dimension": 128,
            "metric": "cosine",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "docs"
        assert data["dimension"] == 128
        assert data["count"] == 0

    def test_create_duplicate(self):
        client.post("/collections", json={"name": "test", "dimension": 4})
        r = client.post("/collections", json={"name": "test", "dimension": 4})
        assert r.status_code == 409

    def test_list_collections(self):
        client.post("/collections", json={"name": "a", "dimension": 2})
        client.post("/collections", json={"name": "b", "dimension": 3})
        r = client.get("/collections")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_collection(self):
        client.post("/collections", json={"name": "test", "dimension": 4})
        r = client.get("/collections/test")
        assert r.status_code == 200
        assert r.json()["name"] == "test"

    def test_get_missing_collection(self):
        r = client.get("/collections/nope")
        assert r.status_code == 404

    def test_delete_collection(self):
        client.post("/collections", json={"name": "test", "dimension": 4})
        r = client.delete("/collections/test")
        assert r.status_code == 200
        r2 = client.get("/collections/test")
        assert r2.status_code == 404

    def test_delete_missing_collection(self):
        r = client.delete("/collections/nope")
        assert r.status_code == 404


# ------------------------------------------------------------------
# Vectors
# ------------------------------------------------------------------

class TestVectors:

    def _create_collection(self, name="test", dim=4):
        client.post("/collections", json={"name": name, "dimension": dim})

    def test_upsert(self):
        self._create_collection()
        r = client.post("/vectors/upsert", json={
            "collection": "test",
            "vectors": [
                {"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]},
                {"id": "v2", "values": [0.0, 1.0, 0.0, 0.0]},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2
        assert "v1" in data["ids"]

    def test_upsert_missing_collection(self):
        r = client.post("/vectors/upsert", json={
            "collection": "nope",
            "vectors": [{"values": [1.0]}],
        })
        assert r.status_code == 404

    def test_upsert_wrong_dimension(self):
        self._create_collection(dim=4)
        r = client.post("/vectors/upsert", json={
            "collection": "test",
            "vectors": [{"id": "bad", "values": [1.0, 2.0]}],
        })
        assert r.status_code == 400

    def test_get_vector(self):
        self._create_collection()
        client.post("/vectors/upsert", json={
            "collection": "test",
            "vectors": [{"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]}],
        })
        r = client.get("/vectors/test/v1")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "v1"
        assert data["dimension"] == 4

    def test_get_missing_vector(self):
        self._create_collection()
        r = client.get("/vectors/test/nope")
        assert r.status_code == 404

    def test_delete_vector(self):
        self._create_collection()
        client.post("/vectors/upsert", json={
            "collection": "test",
            "vectors": [{"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]}],
        })
        r = client.delete("/vectors/test/v1")
        assert r.status_code == 200
        r2 = client.get("/vectors/test/v1")
        assert r2.status_code == 404


# ------------------------------------------------------------------
# Search
# ------------------------------------------------------------------

class TestSearch:

    def _setup_search_collection(self):
        client.post("/collections", json={
            "name": "search_test",
            "dimension": 3,
            "metric": "cosine",
        })
        client.post("/vectors/upsert", json={
            "collection": "search_test",
            "vectors": [
                {"id": "v1", "values": [1.0, 0.0, 0.0], "metadata": {"label": "x"}},
                {"id": "v2", "values": [0.0, 1.0, 0.0], "metadata": {"label": "y"}},
                {"id": "v3", "values": [0.0, 0.0, 1.0], "metadata": {"label": "z"}},
            ],
        })

    def test_search_basic(self):
        self._setup_search_collection()
        r = client.post("/vectors/search", json={
            "collection": "search_test",
            "vector": [0.9, 0.1, 0.0],
            "k": 1,
        })
        assert r.status_code == 200
        data = r.json()
        assert len(data["matches"]) == 1
        assert data["matches"][0]["id"] == "v1"

    def test_search_with_metadata(self):
        self._setup_search_collection()
        r = client.post("/vectors/search", json={
            "collection": "search_test",
            "vector": [0.0, 0.0, 1.0],
            "k": 1,
            "include_metadata": True,
        })
        data = r.json()
        assert data["matches"][0]["metadata"]["label"] == "z"

    def test_search_with_values(self):
        self._setup_search_collection()
        r = client.post("/vectors/search", json={
            "collection": "search_test",
            "vector": [1.0, 0.0, 0.0],
            "k": 1,
            "include_values": True,
        })
        data = r.json()
        assert data["matches"][0]["values"] is not None
        assert len(data["matches"][0]["values"]) == 3

    def test_search_wrong_dimension(self):
        self._setup_search_collection()
        r = client.post("/vectors/search", json={
            "collection": "search_test",
            "vector": [1.0, 0.0],
            "k": 1,
        })
        assert r.status_code == 400

    def test_search_missing_collection(self):
        r = client.post("/vectors/search", json={
            "collection": "nope",
            "vector": [1.0],
            "k": 1,
        })
        assert r.status_code == 404

    def test_search_response_structure(self):
        self._setup_search_collection()
        r = client.post("/vectors/search", json={
            "collection": "search_test",
            "vector": [1.0, 0.0, 0.0],
            "k": 3,
        })
        data = r.json()
        assert data["collection"] == "search_test"
        assert data["query_dimension"] == 3
        assert len(data["matches"]) == 3
        # Results should be sorted by distance
        distances = [m["distance"] for m in data["matches"]]
        assert distances == sorted(distances)
