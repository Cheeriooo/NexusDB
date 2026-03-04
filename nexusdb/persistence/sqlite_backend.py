"""SQLite persistence backend for NexusDB collections."""

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from nexusdb.core.vector import Vector


class SQLiteBackend:
    """SQLite backend for persisting collections to disk."""

    def __init__(self, db_path: str | Path):
        """Initialize SQLite backend.
        
        Args:
            db_path: Path to SQLite database file.
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Initialize database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS vectors (
                    id TEXT PRIMARY KEY,
                    embedding BLOB NOT NULL,
                    metadata TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS collection_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )
            conn.commit()

    def save_collection(
        self,
        collection_name: str,
        dimension: int,
        metric: str,
        vectors: List[Vector],
        created_at: str,
        updated_at: str,
    ) -> None:
        """Save collection to SQLite.
        
        Args:
            collection_name: Name of the collection.
            dimension: Vector dimensionality.
            metric: Distance metric used.
            vectors: List of Vector objects to save.
            created_at: ISO format creation timestamp.
            updated_at: ISO format update timestamp.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Delete existing data
            conn.execute("DELETE FROM vectors")
            conn.execute("DELETE FROM collection_metadata")

            # Save collection metadata
            metadata = {
                "name": collection_name,
                "dimension": dimension,
                "metric": metric,
                "created_at": created_at,
                "updated_at": updated_at,
            }
            for key, value in metadata.items():
                conn.execute(
                    "INSERT INTO collection_metadata (key, value) VALUES (?, ?)",
                    (key, str(value)),
                )

            # Save vectors
            for vec in vectors:
                # Convert embedding to binary
                embedding_bytes = vec.embedding.astype(np.float32).tobytes()
                metadata_json = json.dumps(vec.metadata) if vec.metadata else None

                conn.execute(
                    """
                    INSERT INTO vectors (id, embedding, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        vec.id,
                        embedding_bytes,
                        metadata_json,
                        vec.timestamp.isoformat() if vec.timestamp else None,
                        vec.timestamp.isoformat() if vec.timestamp else None,
                    ),
                )
            conn.commit()

    def load_collection(
        self,
    ) -> tuple[Dict[str, Any], List[Vector]] | tuple[None, None]:
        """Load collection from SQLite.
        
        Returns:
            Tuple of (collection_metadata_dict, list_of_vectors) or (None, None) if empty.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Load metadata
            cursor = conn.execute("SELECT key, value FROM collection_metadata")
            metadata = {row[0]: row[1] for row in cursor.fetchall()}

            if not metadata:
                return None, None

            # Parse metadata
            collection_info = {
                "name": metadata.get("name"),
                "dimension": int(metadata.get("dimension", 0)),
                "metric": metadata.get("metric", "cosine"),
                "created_at": metadata.get("created_at"),
                "updated_at": metadata.get("updated_at"),
            }

            # Load vectors
            cursor = conn.execute(
                """
                SELECT id, embedding, metadata, created_at, updated_at FROM vectors
                """
            )
            vectors = []
            for row in cursor.fetchall():
                vec_id, embedding_bytes, metadata_json, created_at, updated_at = row

                # Reconstruct embedding
                embedding = np.frombuffer(embedding_bytes, dtype=np.float32).copy()

                # Parse metadata
                vec_metadata = json.loads(metadata_json) if metadata_json else {}

                # Create Vector object
                vec = Vector(
                    embedding=embedding,
                    id=vec_id,
                    metadata=vec_metadata,
                    collection=collection_info["name"],
                )

                # Restore timestamp if available
                if created_at:
                    from datetime import datetime
                    vec.timestamp = datetime.fromisoformat(created_at)

                vectors.append(vec)

            return collection_info, vectors

    def clear(self) -> None:
        """Clear all data from the database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM vectors")
            conn.execute("DELETE FROM collection_metadata")
            conn.commit()

    def exists(self) -> bool:
        """Check if database has any data."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM collection_metadata")
            count = cursor.fetchone()[0]
            return count > 0
