"""Configuration for NexusDB persistence."""

import os
from pathlib import Path

# Enable auto-save/load from SQLite
AUTO_PERSIST = os.getenv("NEXUSDB_AUTO_PERSIST", "false").lower() == "true"

# Directory to store collection databases
PERSIST_DIR = Path(os.getenv("NEXUSDB_PERSIST_DIR", "./data"))

# Create persist directory if it doesn't exist
if AUTO_PERSIST:
    PERSIST_DIR.mkdir(parents=True, exist_ok=True)


def get_collection_db_path(collection_name: str) -> Path:
    """Get the database file path for a collection."""
    return PERSIST_DIR / f"{collection_name}.db"
