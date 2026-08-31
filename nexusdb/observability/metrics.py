"""Prometheus metrics for NexusDB.

Request-level metrics (count, latency by path/method/status) come from
`prometheus-fastapi-instrumentator`, wired up in `server.py`. This module
adds the domain-specific gauges that instrumentator can't infer on its own:
vector counts per collection, and the number of collections currently loaded.

Implemented as a `prometheus_client` custom Collector rather than gauges
updated on every write, so `/metrics` always reflects live state read
straight from `_collections` at scrape time — no risk of a missed update
call leaving a gauge stale.
"""

from __future__ import annotations

from collections.abc import Iterator

from prometheus_client.core import GaugeMetricFamily
from prometheus_client.registry import Collector


class CollectionMetricsCollector(Collector):
    def __init__(self, collections: dict) -> None:
        self._collections = collections

    def collect(self) -> Iterator[GaugeMetricFamily]:
        vectors = GaugeMetricFamily(
            "nexusdb_collection_vectors",
            "Number of vectors currently stored in a collection",
            labels=["collection", "index_type"],
        )
        for name, col in self._collections.items():
            vectors.add_metric([name, col.index_type], col.count)
        yield vectors

        total = GaugeMetricFamily(
            "nexusdb_collections_total",
            "Number of collections currently loaded in memory",
        )
        total.add_metric([], len(self._collections))
        yield total
