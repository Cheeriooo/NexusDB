"""Test SQLite persistence functionality."""

import tempfile
from pathlib import Path

from nexusdb.core.collection import Collection
from nexusdb.core.vector import Vector


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
