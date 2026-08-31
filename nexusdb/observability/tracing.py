"""Minimal OpenTelemetry tracing across the search path.

Off by default (tracing is only interesting when someone's actually looking
at a console/collector, and a span per request would otherwise spam every
`pytest` run and CI log). Enable with:

    NEXUSDB_TRACING_ENABLED=true

Spans go to a `ConsoleSpanExporter` — good enough to prove the instrumentation
is real and to demo locally; swapping in an OTLP exporter to ship spans to a
real collector (Jaeger, Tempo, etc.) is a one-line change in `configure_tracing`.
"""

from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.trace import Tracer

_configured = False


def tracing_enabled() -> bool:
    return os.getenv("NEXUSDB_TRACING_ENABLED", "false").lower() == "true"


def configure_tracing(service_name: str = "nexusdb") -> None:
    """Idempotent. No-op (and `get_tracer` returns a no-op tracer) unless enabled."""
    global _configured
    if _configured or not tracing_enabled():
        _configured = True
        return
    _configured = True

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)


def get_tracer(name: str) -> Tracer:
    return trace.get_tracer(name)
