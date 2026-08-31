"""Locust load test for the NexusDB API — the Phase 4 baseline load test.

Simulates a client population that mixes writes and reads against one
pre-existing collection: mostly-search traffic (the hot path a real
deployment would see most of) with a steady trickle of single-vector
upserts, weighted 5:1.

Run against a live server (`uvicorn nexusdb.api.server:app`), headless,
recording p50/p95/p99:

    pip install -e ".[loadtest]"
    NEXUSDB_AUTO_PERSIST=false NEXUSDB_RATE_LIMIT=100000/minute \\
        uvicorn nexusdb.api.server:app &
    python benchmarks/load_test.py --setup   # creates the "loadtest" collection
    locust -f benchmarks/load_test.py --headless \\
        -u 20 -r 5 -t 60s --host http://localhost:8000 \\
        --csv benchmarks/load_test_results

Raise NEXUSDB_RATE_LIMIT before running this — the default (120/minute per
client IP) exists to throttle a single abusive caller, not to cap this load
test's own throughput; Locust's simulated users all share one IP, so at the
default limit they'd all get rate-limited into the ground within seconds and
you'd be measuring slowapi's 429 path, not the API's actual serving latency.
To verify the rate limiter itself instead, hit an endpoint >120 times in
under a minute from one client at the *default* limit and confirm 429s
appear — that's a separate, much shorter check (see docs/BENCHMARKS.md).

`--setup` is a one-off helper (not part of the Locust run itself) since
Locust users assume the collection they hit already exists — sending
`POST /v1/collections` from every simulated user would just 409 after the
first one.
"""

from __future__ import annotations

import argparse
import random

from locust import HttpUser, between, task

COLLECTION = "loadtest"
DIMENSION = 64


def _random_vector() -> list[float]:
    return [random.random() for _ in range(DIMENSION)]


class NexusDBUser(HttpUser):
    wait_time = between(0.05, 0.25)

    @task(5)
    def search(self):
        self.client.post(
            "/v1/vectors/search",
            json={"collection": COLLECTION, "vector": _random_vector(), "k": 10},
            name="/v1/vectors/search",
        )

    @task(1)
    def upsert(self):
        self.client.post(
            "/v1/vectors/upsert",
            json={
                "collection": COLLECTION,
                "vectors": [{"values": _random_vector(), "metadata": {"src": "loadtest"}}],
            },
            name="/v1/vectors/upsert",
        )


def _setup(host: str, seed_count: int) -> None:
    """One-time setup: create the collection and seed it with vectors so
    /vectors/search has something real to scan, not an empty index."""
    import httpx

    with httpx.Client(base_url=host, timeout=30.0) as client:
        r = client.post("/v1/collections", json={"name": COLLECTION, "dimension": DIMENSION})
        if r.status_code not in (201, 409):
            raise RuntimeError(f"Failed to create collection: {r.status_code} {r.text}")

        batch_size = 500
        for start in range(0, seed_count, batch_size):
            n = min(batch_size, seed_count - start)
            vectors = [{"values": _random_vector()} for _ in range(n)]
            r = client.post(
                "/v1/vectors/upsert", json={"collection": COLLECTION, "vectors": vectors}
            )
            r.raise_for_status()
        print(f"Seeded '{COLLECTION}' with {seed_count} vectors (dim={DIMENSION}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--setup", action="store_true", help="Create + seed the collection, then exit")
    parser.add_argument("--host", default="http://localhost:8000")
    parser.add_argument("--seed-count", type=int, default=10_000)
    args = parser.parse_args()

    if args.setup:
        _setup(args.host, args.seed_count)
    else:
        parser.error("This file is a Locust locustfile; run it with --setup to seed data, "
                      "or via `locust -f benchmarks/load_test.py` to run the load test itself.")
