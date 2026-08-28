"""Test SQLite persistence functionality."""

import tempfile
from pathlib import Path

from nexusdb.cli import backup, restore
from nexusdb.core.collection import Collection
from nexusdb.core.vector import Vector
from nexusdb.persistence.sqlite_backend import SQLiteBackend


def test_save_and_load():
    """Test saving and loading a collection."""
    # Create a temporary directory
    tmpdir = tempfile.mkdtemp()
    try:
        db_path = Path(tmpdir) / "test_collection.db"

        # Create a collection
        col = Collection(name="test_col", dimension=3, metric="cosine")

        # Add some vectors
        vectors = [
            Vector(embedding=[0.1, 0.2, 0.3], id="vec1", metadata={"label": "A"}),
            Vector(embedding=[0.4, 0.5, 0.6], id="vec2", metadata={"label": "B"}),
            Vector(embedding=[0.7, 0.8, 0.9], id="vec3", metadata={"label": "C"}),
        ]
        col.add(vectors)

        print(f"Original collection: {col.info()}")
        print(f"Original vector count: {col.count}")

        # Save collection
        col.save(db_path)
        print(f"Saved to {db_path}")

        # Load collection
        loaded_col = Collection.load(db_path)
        print(f"Loaded collection: {loaded_col.info()}")
        print(f"Loaded vector count: {loaded_col.count}")

        # Verify data
        assert loaded_col.name == col.name
        assert loaded_col.dimension == col.dimension
        assert loaded_col.metric == col.metric
        assert loaded_col.count == col.count

        # Verify vectors
        for vec_id in ["vec1", "vec2", "vec3"]:
            orig_vec = col.get(vec_id)
            loaded_vec = loaded_col.get(vec_id)
            assert loaded_vec is not None
            assert loaded_vec.id == orig_vec.id
            assert (loaded_vec.embedding == orig_vec.embedding).all()
            assert loaded_vec.metadata == orig_vec.metadata

        print("✅ All tests passed!")
    finally:
        # Clean up
        import shutil

        shutil.rmtree(tmpdir, ignore_errors=True)


def test_save_and_load_preserves_hnsw_index_type():
    """A collection's index_type/index_params must survive a save/load round-trip,
    or reloading an 'hnsw' collection would silently downgrade it to 'flat'."""
    tmpdir = tempfile.mkdtemp()
    try:
        db_path = Path(tmpdir) / "hnsw_col.db"

        col = Collection(
            name="ann",
            dimension=3,
            metric="cosine",
            index_type="hnsw",
            index_params={"m": 8, "ef_construction": 40},
        )
        col.add([Vector(embedding=[0.1, 0.2, 0.3], id="vec1")])
        col.save(db_path)

        loaded = Collection.load(db_path)
        assert loaded.index_type == "hnsw"
        assert loaded.index_params["m"] == 8
        assert loaded.index_params["ef_construction"] == 40
        assert loaded.count == 1

        from nexusdb.core.index.hnsw_index import HNSWIndex

        assert isinstance(loaded._index, HNSWIndex)
        assert loaded._index.m == 8
    finally:
        import shutil

        shutil.rmtree(tmpdir, ignore_errors=True)


def test_incremental_upsert_and_delete_do_not_rewrite_whole_table():
    """upsert_vectors/delete_vectors touch only the given rows, not the table."""
    tmpdir = tempfile.mkdtemp()
    try:
        db_path = Path(tmpdir) / "incremental.db"
        backend = SQLiteBackend(db_path)

        backend.upsert_metadata(
            collection_name="inc",
            dimension=3,
            metric="cosine",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
        )
        v1 = Vector(embedding=[0.1, 0.2, 0.3], id="a")
        v2 = Vector(embedding=[0.4, 0.5, 0.6], id="b")
        backend.upsert_vectors([v1, v2])

        info, vectors = backend.load_collection()
        assert info["name"] == "inc"
        assert {v.id for v in vectors} == {"a", "b"}

        # Incremental update of an existing id should replace, not duplicate.
        v1_updated = Vector(embedding=[0.9, 0.9, 0.9], id="a")
        backend.upsert_vectors([v1_updated])
        _, vectors = backend.load_collection()
        assert len(vectors) == 2
        updated = next(v for v in vectors if v.id == "a")
        assert list(updated.embedding) == [0.9, 0.9, 0.9]

        # Incremental delete removes only the targeted row.
        backend.delete_vectors(["b"])
        _, vectors = backend.load_collection()
        assert {v.id for v in vectors} == {"a"}
    finally:
        import shutil

        shutil.rmtree(tmpdir, ignore_errors=True)


def test_cli_backup_and_restore_round_trip():
    """nexusdb backup/restore wraps Collection.save/load without needing the API."""
    tmpdir = tempfile.mkdtemp()
    try:
        persist_dir = Path(tmpdir) / "persist"
        persist_dir.mkdir()

        col = Collection(name="cli_test", dimension=3, metric="cosine")
        col.add([Vector(embedding=[1.0, 2.0, 3.0], id="x")])
        col.save(persist_dir / "cli_test.db")

        backup_path = Path(tmpdir) / "cli_test.backup.db"
        assert backup("cli_test", str(backup_path), persist_dir) == 0
        assert backup_path.exists()

        restore_dir = Path(tmpdir) / "restored"
        assert restore(str(backup_path), None, restore_dir) == 0

        restored = Collection.load(restore_dir / "cli_test.db")
        assert restored is not None
        assert restored.count == 1
        assert restored.get("x") is not None
    finally:
        import shutil

        shutil.rmtree(tmpdir, ignore_errors=True)
