"""NexusDB command-line tools — backup and restore collections outside the API.

Usage:
    nexusdb backup <collection> <path> [--persist-dir DIR]
    nexusdb restore <path> [--name NAME] [--persist-dir DIR]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from nexusdb.core.collection import Collection
from nexusdb.persistence.config import PERSIST_DIR


def backup(collection_name: str, output_path: str, persist_dir: Path) -> int:
    """Load a running/persisted collection and save a standalone snapshot of it."""
    source = persist_dir / f"{collection_name}.db"
    if not source.exists():
        print(f"error: no persisted collection '{collection_name}' found at {source}")
        return 1

    col = Collection.load(source)
    if col is None:
        print(f"error: '{source}' exists but contains no collection data")
        return 1

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    col.save(output_path)
    print(f"backed up '{collection_name}' ({col.count} vectors) -> {output_path}")
    return 0


def restore(input_path: str, name: str | None, persist_dir: Path) -> int:
    """Load a collection snapshot and install it into the persist directory."""
    source = Path(input_path)
    if not source.exists():
        print(f"error: backup file not found: {source}")
        return 1

    col = Collection.load(source)
    if col is None:
        print(f"error: '{source}' contains no collection data")
        return 1

    if name:
        col.name = name

    persist_dir.mkdir(parents=True, exist_ok=True)
    destination = persist_dir / f"{col.name}.db"
    col.save(destination)
    print(f"restored '{col.name}' ({col.count} vectors) -> {destination}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nexusdb", description="NexusDB backup/restore CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser(
        "backup", help="Snapshot a persisted collection to a file"
    )
    backup_parser.add_argument("collection", help="Name of the persisted collection")
    backup_parser.add_argument("path", help="Output file path for the backup")
    backup_parser.add_argument(
        "--persist-dir",
        default=None,
        help="Directory collections are auto-persisted in (defaults to NEXUSDB_PERSIST_DIR)",
    )

    restore_parser = subparsers.add_parser("restore", help="Restore a backup into the persist dir")
    restore_parser.add_argument("path", help="Path to a backup file created by 'nexusdb backup'")
    restore_parser.add_argument(
        "--name", default=None, help="Override the collection name on restore"
    )
    restore_parser.add_argument(
        "--persist-dir",
        default=None,
        help="Directory to restore into (defaults to NEXUSDB_PERSIST_DIR)",
    )

    args = parser.parse_args(argv)
    persist_dir = Path(args.persist_dir) if args.persist_dir else PERSIST_DIR

    if args.command == "backup":
        return backup(args.collection, args.path, persist_dir)
    return restore(args.path, args.name, persist_dir)


if __name__ == "__main__":
    sys.exit(main())
