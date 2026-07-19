"""Shared MongoDB Atlas client for INN-SIGHT.

Uses the InnSight database (matches the Atlas UI). Degrades to None when
MONGODB_URI is missing or unreachable so the demo path never hard-depends on DB.
"""

from __future__ import annotations

import os
from typing import Any

_client: Any | None = None
_checked = False


def mongo_client() -> Any | None:
    global _client, _checked
    uri = (os.environ.get("MONGODB_URI") or "").strip()
    if not uri:
        return None
    if _client is not None:
        return _client
    # Allow retry after a previous failed connect (e.g. env loaded late).
    try:
        from pymongo import MongoClient

        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=8000,
        )
        client.admin.command("ping")
        _client = client
        _checked = True
        return _client
    except Exception:
        _checked = True
        _client = None
        return None


def db_name() -> str:
    return (os.environ.get("MONGODB_DB") or "InnSight").strip()


def collection(name: str) -> Any | None:
    client = mongo_client()
    if client is None:
        return None
    return client[db_name()][name]
