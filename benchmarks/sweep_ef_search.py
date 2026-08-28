#!/usr/bin/env python3
"""One-off: build the HNSW graph at n=100k once, then sweep ef_search values
against it (no rebuild needed — ef_search is a per-query parameter) to find
where recall clears ~95% and what that costs in latency vs FlatIndex.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nexusdb.core.index.flat_index import FlatIndex  # noqa: E402
from nexusdb.core.index.hnsw_index import HNSWIndex  # noqa: E402
from nexusdb.core.vector import Vector  # noqa: E402

DIM = 128
N = 100_000
K = 10
NUM_QUERIES = 30
SEED = 42

rng = np.random.default_rng(SEED)
embeddings = rng.standard_normal((N, DIM)).astype(np.float32)
vectors = [Vector(embedding=embeddings[i], id=f"vec-{i}") for i in range(N)]

print(f"[sweep] building FlatIndex (n={N})...", flush=True)
flat = FlatIndex(dimension=DIM, metric="cosine")
flat.add(vectors)

print(f"[sweep] building HNSWIndex (n={N}, m=16, ef_construction=100)...", flush=True)
t0 = time.perf_counter()
hnsw = HNSWIndex(dimension=DIM, metric="cosine", m=16, ef_construction=100, seed=SEED)
hnsw.add(vectors)
print(f"[sweep] hnsw build: {time.perf_counter() - t0:.1f}s", flush=True)

query_rng = np.random.default_rng(SEED + 1)
queries = query_rng.standard_normal((NUM_QUERIES, DIM)).astype(np.float32)

flat_latencies = []
ground_truth = []
for q in queries:
    t0 = time.perf_counter()
    results = flat.search(q, k=K)
    flat_latencies.append(time.perf_counter() - t0)
    ground_truth.append({r.id for r in results})

flat_p50 = float(np.percentile(flat_latencies, 50)) * 1000
flat_p95 = float(np.percentile(flat_latencies, 95)) * 1000
print(f"[sweep] flat p50={flat_p50:.3f}ms p95={flat_p95:.3f}ms")

for ef_search in [150, 300, 500, 800, 1200, 2000]:
    latencies = []
    recalls = []
    for q, exact_ids in zip(queries, ground_truth, strict=True):
        t0 = time.perf_counter()
        results = hnsw.search(q, k=K, ef_search=ef_search)
        latencies.append(time.perf_counter() - t0)
        approx_ids = {r.id for r in results}
        recalls.append(len(exact_ids & approx_ids) / K)

    p50 = float(np.percentile(latencies, 50)) * 1000
    p95 = float(np.percentile(latencies, 95)) * 1000
    recall = float(np.mean(recalls))
    speedup = flat_p50 / p50 if p50 > 0 else float("inf")
    print(
        f"[sweep] ef_search={ef_search:5d}: recall@{K}={recall:.3f} "
        f"p50={p50:.3f}ms p95={p95:.3f}ms speedup={speedup:.2f}x",
        flush=True,
    )

print("[sweep] done")
