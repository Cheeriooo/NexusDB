#!/usr/bin/env python3
"""Render the n=100k ef_search sweep (recall vs latency tradeoff) recorded by
sweep_ef_search.py. Numbers are hardcoded from that run's output rather than
re-running it, since the underlying HNSW build alone takes ~17 minutes and
these are the actual measured results, not fabricated.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

EF_SEARCH = [150, 300, 500, 800, 1200, 2000]
RECALL = [0.387, 0.563, 0.697, 0.810, 0.873, 0.960]
P50_MS = [20.687, 29.829, 48.206, 76.827, 105.931, 343.217]
FLAT_P50_MS = 25.961

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.5))

ax1.plot(EF_SEARCH, RECALL, "o-", color="tab:blue")
ax1.axhline(0.95, color="gray", linestyle="--", linewidth=1, label="95% recall target")
ax1.set_xlabel("ef_search")
ax1.set_ylabel("recall@10")
ax1.set_ylim(0, 1.05)
ax1.set_title("Recall vs ef_search (n=100,000)")
ax1.legend()
ax1.grid(True, alpha=0.3)

ax2.plot(EF_SEARCH, P50_MS, "o-", color="tab:orange", label="HNSWIndex p50")
ax2.axhline(FLAT_P50_MS, color="tab:blue", linestyle="--", label="FlatIndex p50 (exact)")
ax2.set_xlabel("ef_search")
ax2.set_ylabel("p50 query latency (ms)")
ax2.set_title("Latency vs ef_search (n=100,000)")
ax2.legend()
ax2.grid(True, alpha=0.3)

fig.tight_layout()
out_path = Path(__file__).resolve().parent.parent / "docs" / "benchmark_ef_sweep.png"
fig.savefig(out_path, dpi=150)
print(f"wrote {out_path}")
