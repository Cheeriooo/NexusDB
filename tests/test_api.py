"""Integration tests for the FastAPI REST API."""

import pytest
from fastapi.testclient import TestClient

from nexusdb.api.server import _collections, app


@pytest.fixture(autouse=True)
def clean_collections():
    """Clear all collections before each test."""
    _collections.clear()
    yield
    _collections.clear()


class _V1Client:
    """Thin TestClient wrapper that prefixes /v1 onto every path except /health.

    Keeps the many literal-path call sites below unchanged after the API was
    versioned under /v1 (health stays unversioned for liveness probes).
    """

    def __init__(self, app):
        self._client = TestClient(app)

    def _prefixed(self, path: str) -> str:
        return path if path.startswith("/health") else f"/v1{path}"

    def get(self, path, **kwargs):
        return self._client.get(self._prefixed(path), **kwargs)

    def post(self, path, **kwargs):
        return self._client.post(self._prefixed(path), **kwargs)

    def delete(self, path, **kwargs):
        return self._client.delete(self._prefixed(path), **kwargs)


client = _V1Client(app)


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
        r = client.post(
            "/collections",
            json={
                "name": "docs",
                "dimension": 128,
                "metric": "cosine",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "docs"
        assert data["dimension"] == 128
        assert data["count"] == 0

    def test_create_duplicate(self):
        client.post("/collections", json={"name": "test", "dimension": 4})
        r = client.post("/collections", json={"name": "test", "dimension": 4})
        assert r.status_code == 409

    def test_create_hnsw_collection(self):
        r = client.post(
            "/collections",
            json={
                "name": "ann",
                "dimension": 8,
                "metric": "cosine",
                "index_type": "hnsw",
                "m": 8,
                "ef_construction": 40,
                "ef_search": 30,
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["index_type"] == "hnsw"

    def test_create_unknown_index_type_rejected(self):
        r = client.post(
            "/collections",
            json={"name": "bad", "dimension": 4, "index_type": "ivf"},
        )
        assert r.status_code == 422  # pydantic pattern validation on CollectionCreate

    def test_hnsw_collection_search_roundtrip(self):
        client.post(
            "/collections",
            json={
                "name": "ann",
                "dimension": 4,
                "index_type": "hnsw",
                "m": 4,
                "ef_construction": 20,
            },
        )
        client.post(
            "/vectors/upsert",
            json={
                "collection": "ann",
                "vectors": [
                    {"id": "a", "values": [1.0, 0.0, 0.0, 0.0]},
                    {"id": "b", "values": [0.0, 1.0, 0.0, 0.0]},
                ],
            },
        )
        r = client.post(
            "/vectors/search",
            json={"collection": "ann", "vector": [0.9, 0.1, 0.0, 0.0], "k": 1},
        )
        assert r.status_code == 200
        assert r.json()["matches"][0]["id"] == "a"

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
        r = client.post(
            "/vectors/upsert",
            json={
                "collection": "test",
                "vectors": [
                    {"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]},
                    {"id": "v2", "values": [0.0, 1.0, 0.0, 0.0]},
                ],
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2
        assert "v1" in data["ids"]

    def test_upsert_auto_generates_id_when_omitted(self):
        """Regression: explicitly passing id=None to Vector's constructor used
        to override its default_factory (uuid4), leaving id=None and crashing
        UpsertResponse's pydantic validation with a 500 instead of a UUID."""
        self._create_collection()
        r = client.post(
            "/vectors/upsert",
            json={"collection": "test", "vectors": [{"values": [1.0, 0.0, 0.0, 0.0]}]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        assert data["ids"][0]

    def test_upsert_missing_collection(self):
        r = client.post(
            "/vectors/upsert",
            json={
                "collection": "nope",
                "vectors": [{"values": [1.0]}],
            },
        )
        assert r.status_code == 404

    def test_upsert_wrong_dimension(self):
        self._create_collection(dim=4)
        r = client.post(
            "/vectors/upsert",
            json={
                "collection": "test",
                "vectors": [{"id": "bad", "values": [1.0, 2.0]}],
            },
        )
        assert r.status_code == 400

    def test_get_vector(self):
        self._create_collection()
        client.post(
            "/vectors/upsert",
            json={
                "collection": "test",
                "vectors": [{"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]}],
            },
        )
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
        client.post(
            "/vectors/upsert",
            json={
                "collection": "test",
                "vectors": [{"id": "v1", "values": [1.0, 0.0, 0.0, 0.0]}],
            },
        )
        r = client.delete("/vectors/test/v1")
        assert r.status_code == 200
        r2 = client.get("/vectors/test/v1")
        assert r2.status_code == 404


# ------------------------------------------------------------------
# Search
# ------------------------------------------------------------------


class TestSearch:

    def _setup_search_collection(self):
        client.post(
            "/collections",
            json={
                "name": "search_test",
                "dimension": 3,
                "metric": "cosine",
            },
        )
        client.post(
            "/vectors/upsert",
            json={
                "collection": "search_test",
                "vectors": [
                    {"id": "v1", "values": [1.0, 0.0, 0.0], "metadata": {"label": "x"}},
                    {"id": "v2", "values": [0.0, 1.0, 0.0], "metadata": {"label": "y"}},
                    {"id": "v3", "values": [0.0, 0.0, 1.0], "metadata": {"label": "z"}},
                ],
            },
        )

    def test_search_basic(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [0.9, 0.1, 0.0],
                "k": 1,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["matches"]) == 1
        assert data["matches"][0]["id"] == "v1"

    def test_search_with_metadata(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [0.0, 0.0, 1.0],
                "k": 1,
                "include_metadata": True,
            },
        )
        data = r.json()
        assert data["matches"][0]["metadata"]["label"] == "z"

    def test_search_with_values(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [1.0, 0.0, 0.0],
                "k": 1,
                "include_values": True,
            },
        )
        data = r.json()
        assert data["matches"][0]["values"] is not None
        assert len(data["matches"][0]["values"]) == 3

    def test_search_wrong_dimension(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [1.0, 0.0],
                "k": 1,
            },
        )
        assert r.status_code == 400

    def test_search_missing_collection(self):
        r = client.post(
            "/vectors/search",
            json={
                "collection": "nope",
                "vector": [1.0],
                "k": 1,
            },
        )
        assert r.status_code == 404

    def test_search_response_structure(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [1.0, 0.0, 0.0],
                "k": 3,
            },
        )
        data = r.json()
        assert data["collection"] == "search_test"
        assert data["query_dimension"] == 3
        assert len(data["matches"]) == 3
        # Results should be sorted by distance
        distances = [m["distance"] for m in data["matches"]]
        assert distances == sorted(distances)

    def test_search_with_metadata_filter(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [1.0, 0.0, 0.0],
                "k": 3,
                "filter": {"label": "z"},
            },
        )
        assert r.status_code == 200
        matches = r.json()["matches"]
        assert len(matches) == 1
        assert matches[0]["id"] == "v3"

    def test_search_with_metadata_filter_no_match(self):
        self._setup_search_collection()
        r = client.post(
            "/vectors/search",
            json={
                "collection": "search_test",
                "vector": [1.0, 0.0, 0.0],
                "k": 3,
                "filter": {"label": "does-not-exist"},
            },
        )
        assert r.status_code == 200
        assert r.json()["matches"] == []


# ------------------------------------------------------------------
# Batch (streaming NDJSON) upsert
# ------------------------------------------------------------------


class TestBatchUpsert:

    def _create_collection(self, name="batch", dim=3):
        client.post("/collections", json={"name": name, "dimension": dim})

    def test_batch_upsert_ndjson(self):
        self._create_collection()
        body = (
            b'{"id": "a", "values": [1.0, 0.0, 0.0]}\n'
            b'{"id": "b", "values": [0.0, 1.0, 0.0], "metadata": {"k": "v"}}\n'
        )
        r = client.post(
            "/vectors/upsert-batch?collection=batch",
            content=body,
            headers={"Content-Type": "application/x-ndjson"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2
        assert set(data["ids"]) == {"a", "b"}

        got = client.get("/vectors/batch/b")
        assert got.status_code == 200
        assert got.json()["metadata"] == {"k": "v"}

    def test_batch_upsert_auto_generates_id_when_omitted(self):
        """Same regression as test_upsert_auto_generates_id_when_omitted, for
        the streaming NDJSON batch path."""
        self._create_collection()
        r = client.post(
            "/vectors/upsert-batch?collection=batch",
            content=b'{"values": [1.0, 0.0, 0.0]}\n',
            headers={"Content-Type": "application/x-ndjson"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        assert data["ids"][0]

    def test_batch_upsert_respects_batch_size(self):
        self._create_collection()
        lines = b"".join(
            f'{{"id": "v{i}", "values": [1.0, 0.0, 0.0]}}\n'.encode() for i in range(5)
        )
        r = client.post(
            "/vectors/upsert-batch?collection=batch&batch_size=2",
            content=lines,
        )
        assert r.status_code == 200
        assert r.json()["count"] == 5

    def test_batch_upsert_missing_collection(self):
        r = client.post(
            "/vectors/upsert-batch?collection=nope",
            content=b'{"id": "a", "values": [1.0]}\n',
        )
        assert r.status_code == 404

    def test_batch_upsert_bad_line(self):
        self._create_collection()
        r = client.post(
            "/vectors/upsert-batch?collection=batch",
            content=b"not json\n",
        )
        assert r.status_code == 400


# ------------------------------------------------------------------
# Versioning & health
# ------------------------------------------------------------------


class TestVersioningAndHealth:

    def test_health_is_unversioned(self):
        r = client._client.get("/health")
        assert r.status_code == 200

    def test_collections_requires_v1_prefix(self):
        r = client._client.get("/collections")
        assert r.status_code == 404

    def test_v1_collections_reachable(self):
        r = client._client.get("/v1/collections")
        assert r.status_code == 200


# ------------------------------------------------------------------
# Auth (API key)
# ------------------------------------------------------------------


class TestRateLimit:

    def test_default_limit_is_enforced_on_v1_routes(self, monkeypatch):
        """Regression: SlowAPIMiddleware's own route-handler lookup
        (`_find_route_handler` walking `app.routes`) doesn't find routes
        mounted via `app.include_router()` on this FastAPI/Starlette version
        — they show up as one opaque entry rather than being flattened — so
        it always treated every /v1 route as "exempt" and the configured
        rate limit silently never applied. `RateLimitMiddleware` (server.py)
        replaces it by calling `sync_check_limits` directly. Uses a tight
        limit here (swapped into the already-constructed limiter, since
        NEXUSDB_RATE_LIMIT is only read once at import time) so the test
        doesn't need 120+ requests."""
        from slowapi.wrappers import LimitGroup

        import nexusdb.api.server as server

        original_limits = server.limiter._default_limits
        tight_limit = LimitGroup(
            "3/minute", server.limiter._key_func, None, False, None, None, None, 1, False
        )
        monkeypatch.setattr(server.limiter, "_default_limits", [tight_limit])
        try:
            codes = [client._client.get("/v1/collections").status_code for _ in range(6)]
            assert codes.count(200) == 3
            assert codes.count(429) == 3
        finally:
            server.limiter.reset()
            monkeypatch.setattr(server.limiter, "_default_limits", original_limits)


class TestApiKeyAuth:

    def test_auth_disabled_by_default(self):
        r = client.get("/collections")
        assert r.status_code == 200

    def test_auth_enforced_when_key_configured(self, monkeypatch):
        import nexusdb.api.server as server

        monkeypatch.setattr(server, "API_KEY", "secret123")
        try:
            denied = client._client.get("/v1/collections")
            assert denied.status_code == 401

            allowed = client._client.get("/v1/collections", headers={"X-API-Key": "secret123"})
            assert allowed.status_code == 200

            health = client._client.get("/health")
            assert health.status_code == 200
        finally:
            monkeypatch.setattr(server, "API_KEY", None)


# ------------------------------------------------------------------
# Observability: liveness/readiness, request IDs, metrics
# ------------------------------------------------------------------


class TestObservability:

    def test_liveness_always_ok(self):
        r = client._client.get("/health/live")
        assert r.status_code == 200
        assert r.json()["status"] == "alive"

    def test_readiness_ok_when_ready(self):
        r = client._client.get("/health/ready")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ready"
        assert "collections" in data
        assert "total_vectors" in data

    def test_readiness_503_when_not_ready(self, monkeypatch):
        import nexusdb.api.server as server

        monkeypatch.setattr(server, "_ready", False)
        r = client._client.get("/health/ready")
        assert r.status_code == 503

    def test_response_echoes_request_id_header(self):
        r = client._client.get("/health", headers={"X-Request-ID": "test-req-123"})
        assert r.headers["x-request-id"] == "test-req-123"

    def test_response_generates_request_id_when_absent(self):
        r = client._client.get("/health")
        assert "x-request-id" in r.headers
        assert len(r.headers["x-request-id"]) > 0

    def test_metrics_endpoint_exposes_prometheus_format(self):
        r = client._client.get("/metrics")
        assert r.status_code == 200
        assert "text/plain" in r.headers["content-type"]

    def test_metrics_reflects_collection_vector_counts(self):
        client.post("/collections", json={"name": "m", "dimension": 2})
        client.post(
            "/vectors/upsert",
            json={"collection": "m", "vectors": [{"values": [1.0, 0.0]}]},
        )
        r = client._client.get("/metrics")
        assert 'nexusdb_collection_vectors{collection="m",index_type="flat"} 1.0' in r.text


# ------------------------------------------------------------------
# Persistence: save/load path safety
# ------------------------------------------------------------------


class TestPersistencePathSafety:
    """save/load take a bare filename confined to PERSIST_DIR, not an
    arbitrary filesystem path — a remote client must not be able to write
    or read files outside that directory."""

    def _persist_dir(self, tmp_path, monkeypatch):
        import nexusdb.api.server as server

        monkeypatch.setattr(server, "PERSIST_DIR", tmp_path)
        return tmp_path

    def test_save_round_trips_within_persist_dir(self, tmp_path, monkeypatch):
        self._persist_dir(tmp_path, monkeypatch)
        client.post("/collections", json={"name": "p", "dimension": 2})
        client.post(
            "/vectors/upsert",
            json={"collection": "p", "vectors": [{"values": [1.0, 0.0]}]},
        )
        r = client.post("/collections/p/save", json={"collection": "p", "filepath": "p.db"})
        assert r.status_code == 200
        assert (tmp_path / "p.db").exists()

    @pytest.mark.parametrize(
        "bad_path",
        [
            "../escape.db",
            "../../etc/passwd",
            "/absolute/path.db",
            "sub/dir.db",
        ],
    )
    def test_save_rejects_path_traversal(self, tmp_path, monkeypatch, bad_path):
        self._persist_dir(tmp_path, monkeypatch)
        client.post("/collections", json={"name": "p", "dimension": 2})
        r = client.post("/collections/p/save", json={"collection": "p", "filepath": bad_path})
        assert r.status_code == 400

    @pytest.mark.parametrize(
        "bad_path",
        ["../escape.db", "/absolute/path.db", "sub/dir.db", ""],
    )
    def test_load_rejects_path_traversal(self, tmp_path, monkeypatch, bad_path):
        self._persist_dir(tmp_path, monkeypatch)
        r = client.post("/collections/load", json={"filepath": bad_path})
        assert r.status_code == 400


class TestCollectionNameValidation:

    def test_rejects_path_traversal_in_name(self):
        r = client.post("/collections", json={"name": "../escape", "dimension": 2})
        assert r.status_code == 422

    def test_rejects_slash_in_name(self):
        r = client.post("/collections", json={"name": "a/b", "dimension": 2})
        assert r.status_code == 422

    def test_accepts_safe_name(self):
        r = client.post("/collections", json={"name": "safe-name_1", "dimension": 2})
        assert r.status_code == 201
