"""Structured (JSON) logging with per-request correlation IDs.

Replaces the old `print()` calls in the API layer. Every log line from
`nexusdb.*` loggers carries a `request_id` field — "-" outside a request
context (e.g. at startup) — set by `RequestContextMiddleware` via a
`ContextVar`, so concurrent requests' log lines don't get mixed up.

Configure via:
    NEXUSDB_LOG_LEVEL  — DEBUG/INFO/WARNING/ERROR (default INFO)
    NEXUSDB_LOG_FORMAT — "json" (default) or "text" for local reading
"""

from __future__ import annotations

import json
import logging
import os
import sys
from contextvars import ContextVar

_request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributes present on every stdlib LogRecord — anything else on a record
# (passed via `extra={...}`) is treated as a structured field and folded
# into the JSON payload.
_STANDARD_RECORD_ATTRS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message",
    "asctime",
}


def get_request_id() -> str | None:
    return _request_id_ctx.get()


def set_request_id(request_id: str | None):
    """Sets the current request ID; returns a token for `reset_request_id`."""
    return _request_id_ctx.set(request_id)


def reset_request_id(token) -> None:
    _request_id_ctx.reset(token)


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_ctx.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_RECORD_ATTRS and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_configured = False


def configure_logging() -> None:
    """Idempotent: safe to call from both server startup and tests."""
    global _configured
    if _configured:
        return
    _configured = True

    level = getattr(logging, os.getenv("NEXUSDB_LOG_LEVEL", "INFO").upper(), logging.INFO)
    fmt = os.getenv("NEXUSDB_LOG_FORMAT", "json").lower()

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    if fmt == "text":
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")
        )
    else:
        handler.setFormatter(JsonFormatter())

    root = logging.getLogger("nexusdb")
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)
    root.propagate = False


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
