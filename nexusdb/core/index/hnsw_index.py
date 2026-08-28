"""HNSW (Hierarchical Navigable Small World) approximate nearest-neighbor index.

Built from scratch, following Malkov & Yashunin (2016) "Efficient and robust
approximate nearest neighbor search using Hierarchical Navigable Small World
graphs" (https://arxiv.org/abs/1603.09320): a multi-layer graph where each
layer is a navigable small-world graph, sparser at higher layers, giving
greedy search logarithmic expected hops instead of `FlatIndex`'s linear scan.

Deliberate simplifications versus the paper (documented rather than hidden):

* **Neighbor selection** uses the simple "closest-M" heuristic, not the
  paper's diversity-aware heuristic (algorithm 4). Closest-M is what most
  reference implementations start with; it costs a little recall in
  clustered/skewed data in exchange for much simpler code.
* **Delete support**: repairing every neighbor list that points at a removed
  node is expensive, so `remove()` is a *soft* delete — the vector
  disappears from `get()`/search results immediately, but its graph node and
  edges stay in place so other nodes can still traverse through it. Once the
  soft-deleted fraction crosses `rebuild_threshold`, the whole graph is
  rebuilt from the surviving vectors. An upsert of an existing ID is treated
  the same way (soft-delete the old node, insert a fresh one) since the
  vector's position in the graph has to move anyway.
* **Concurrency**: the whole graph is mutated in place during insertion
  (unlike `FlatIndex`'s copy-on-write matrix rebuild), so `add()`/`remove()`/
  `search()` each hold the instance lock for their full duration rather than
  just a snapshot. This trades away concurrent search throughput for
  straightforward correctness — the same class of bug fixed in `FlatIndex`
  during Phase 1 (reading mutable state after releasing the lock) is much
  easier to reintroduce in a graph structure than in a dense matrix.
"""

from __future__ import annotations

import heapq
import math
import random
import threading

import numpy as np

from nexusdb.core.index.base import Index, SearchResult
from nexusdb.core.vector import Vector
from nexusdb.utils.distance import get_distance_fn

__all__ = ["HNSWIndex", "SearchResult"]


class HNSWIndex(Index):
    """Approximate nearest-neighbor index using an HNSW graph.

    Args:
        dimension: Dimensionality of vectors in this index.
        metric: Distance metric — 'cosine', 'euclidean'/'l2', or 'dot'/'inner_product'.
        m: Max number of connections per node per layer (layer 0 gets `2*m`).
           Higher `m` improves recall at the cost of memory and build time.
        ef_construction: Size of the dynamic candidate list used while
           building the graph. Higher improves graph quality (and recall) at
           the cost of build time.
        ef_search: Default size of the dynamic candidate list used at query
           time when the caller doesn't override it. Higher improves recall
           at the cost of query latency.
        rebuild_threshold: Once this fraction of all graph nodes are
           soft-deleted, the graph is rebuilt from the surviving vectors.
        seed: Optional seed for the level-assignment RNG, for reproducible graphs.
    """

    def __init__(
        self,
        dimension: int,
        metric: str = "cosine",
        m: int = 16,
        ef_construction: int = 200,
        ef_search: int = 50,
        rebuild_threshold: float = 0.2,
        seed: int | None = None,
    ) -> None:
        if dimension <= 0:
            raise ValueError(f"dimension must be positive, got {dimension}")
        if m < 2:
            raise ValueError(f"m must be >= 2, got {m}")
        if not 0 < rebuild_threshold <= 1:
            raise ValueError(f"rebuild_threshold must be in (0, 1], got {rebuild_threshold}")

        get_distance_fn(metric)  # validates the metric name; raises ValueError if unknown
        self.dimension = dimension
        self.metric = metric
        self.m = m
        self.m_max0 = m * 2
        self.ef_construction = max(ef_construction, m)
        self.ef_search = ef_search
        self.rebuild_threshold = rebuild_threshold

        # Graph construction/search issues thousands of tiny distance queries
        # against the *same* query vector and heavily-revisited candidates, so
        # the generic `get_distance_fn` callables (which recompute every norm
        # on every call) become the dominant cost. `_distance_batch` below
        # caches each embedding's norm once (`_norms`, cosine only) and takes
        # the query's norm as a precomputed argument instead.
        normalized = metric.lower().strip()
        self._metric_kind = {"l2": "euclidean", "inner_product": "dot"}.get(normalized, normalized)
        self._level_mult = 1.0 / math.log(m)
        self._rng = random.Random(seed)

        self._vectors: dict[str, Vector] = {}  # id -> Vector, live only
        self._embeddings: dict[str, np.ndarray] = {}  # id -> embedding, includes tombstones
        self._norms: dict[str, float] = {}  # id -> ||embedding||, cosine only
        self._graph: dict[str, dict[int, list[str]]] = {}  # id -> {level: [neighbor ids]}
        self._levels: dict[str, int] = {}  # id -> max level, includes tombstones
        self._deleted: set[str] = set()  # soft-deleted (tombstoned) ids

        self._entry_point: str | None = None
        self._max_level: int = -1

        # Distance computations issued by the most recent `search()` call —
        # a wall-clock-independent way to show the algorithm visits far fewer
        # candidates than brute force, even where pure-Python interpreter
        # overhead outweighs that savings in raw latency at modest scale.
        self.last_search_distance_count = 0

        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def size(self) -> int:
        """Number of live (non-deleted) vectors in the index."""
        return len(self._vectors)

    def add(self, vectors: list[Vector]) -> list[str]:
        """Add vectors to the index. If a vector with the same ID exists, it is updated.

        Raises:
            ValueError: If any vector has a mismatched dimension.
        """
        ids: list[str] = []
        with self._lock:
            for vec in vectors:
                if vec.dimension != self.dimension:
                    raise ValueError(
                        f"Vector '{vec.id}' has dimension {vec.dimension}, "
                        f"expected {self.dimension}"
                    )
                self._insert(vec)
                ids.append(vec.id)
        return ids

    def get(self, vector_id: str) -> Vector | None:
        """Retrieve a vector by its ID."""
        return self._vectors.get(vector_id)

    def remove(self, vector_id: str) -> bool:
        """Soft-delete a vector by its ID. Returns True if it was found and removed."""
        with self._lock:
            if vector_id not in self._vectors:
                return False
            self._soft_delete(vector_id)
            self._maybe_rebuild()
            return True

    def search(
        self,
        query: np.ndarray,
        k: int = 10,
        ids_filter: set | None = None,
        ef_search: int | None = None,
    ) -> list[SearchResult]:
        """Find the approximate k nearest neighbors to the query vector.

        Args:
            query: Query vector of shape (D,).
            k: Number of results to return.
            ids_filter: If provided, only IDs in this set are returned. Applied
                as a post-filter on the graph's ef-sized candidate list rather
                than pushed into traversal, so a very restrictive filter can
                return fewer than `k` results — full pushdown is Phase 3 work.
            ef_search: Override this index's default `ef_search` for this call.

        Returns:
            List of SearchResult sorted by distance (ascending).
        """
        if query.ndim != 1 or len(query) != self.dimension:
            raise ValueError(
                f"Query must be 1D with dimension {self.dimension}, got shape {query.shape}"
            )
        if k <= 0:
            return []

        query = query.astype(np.float32)
        ef = max(ef_search or self.ef_search, k)
        query_norm = self._query_norm(query)

        with self._lock:
            self.last_search_distance_count = 0
            if self._entry_point is None:
                return []

            cur = self._entry_point
            for level in range(self._max_level, 0, -1):
                nearest = self._search_layer(query, query_norm, [cur], ef=1, level=level)
                if nearest:
                    cur = nearest[0][1]

            candidates = self._search_layer(query, query_norm, [cur], ef=ef, level=0)

            if ids_filter is not None:
                candidates = [(d, nid) for d, nid in candidates if nid in ids_filter]

            top = candidates[:k]
            return [
                SearchResult(id=nid, distance=float(d), vector=self._vectors.get(nid))
                for d, nid in top
            ]

    def clear(self) -> None:
        """Remove all vectors from the index."""
        with self._lock:
            self._vectors.clear()
            self._embeddings.clear()
            self._norms.clear()
            self._graph.clear()
            self._levels.clear()
            self._deleted.clear()
            self._entry_point = None
            self._max_level = -1

    # ------------------------------------------------------------------
    # Internal — graph construction
    # ------------------------------------------------------------------

    def _random_level(self) -> int:
        """Sample a layer for a new node from an exponential decay distribution.

        Expected number of nodes at layer `l` shrinks by a factor of `m` per
        layer, which is what gives the graph its logarithmic search depth.
        """
        r = self._rng.random()
        while r == 0.0:
            r = self._rng.random()
        return int(-math.log(r) * self._level_mult)

    def _query_norm(self, query: np.ndarray) -> float:
        """Precompute the query's norm once per top-level call (cosine only)."""
        return float(np.linalg.norm(query)) if self._metric_kind == "cosine" else 0.0

    def _register_embedding(self, vid: str, embedding: np.ndarray) -> None:
        self._embeddings[vid] = embedding
        if self._metric_kind == "cosine":
            self._norms[vid] = float(np.linalg.norm(embedding))

    def _distance_batch(
        self, query: np.ndarray, query_norm: float, node_ids: list[str]
    ) -> np.ndarray:
        """Distance from `query` to each of `node_ids`, using cached embedding norms.

        Equivalent to `nexusdb.utils.distance`'s functions, but avoids
        recomputing `query`'s norm (constant across a whole search/insert
        call) and every candidate's norm (constant across its lifetime)
        on each of the many small batches a graph traversal issues.
        """
        self.last_search_distance_count += len(node_ids)
        matrix = np.vstack([self._embeddings[nid] for nid in node_ids])

        if self._metric_kind == "cosine":
            if query_norm == 0.0:
                return np.ones(len(node_ids), dtype=np.float32)
            norms_b = np.array([self._norms[nid] for nid in node_ids], dtype=np.float32)
            safe_norms_b = np.where(norms_b == 0, 1.0, norms_b)
            sims = (matrix @ query) / (query_norm * safe_norms_b)
            np.clip(sims, -1.0, 1.0, out=sims)
            return (1.0 - sims).astype(np.float32)

        if self._metric_kind == "euclidean":
            diff = matrix - query
            return np.sqrt(np.einsum("ij,ij->i", diff, diff)).astype(np.float32)

        # dot / inner_product
        return (-(matrix @ query)).astype(np.float32)

    def _distance_to(self, query: np.ndarray, query_norm: float, node_id: str) -> float:
        return float(self._distance_batch(query, query_norm, [node_id])[0])

    def _search_layer(
        self,
        query: np.ndarray,
        query_norm: float,
        entry_points: list[str],
        ef: int,
        level: int,
    ) -> list[tuple[float, str]]:
        """Greedy best-first search of a single layer.

        Returns up to `ef` (distance, id) pairs, sorted ascending, containing
        only live (non-tombstoned) nodes — though traversal freely passes
        through tombstoned nodes to preserve graph connectivity.
        """
        visited = set(entry_points)
        candidates: list[tuple[float, str]] = []  # min-heap by distance
        found: list[tuple[float, str]] = []  # max-heap (negated distance), size <= ef

        for ep in entry_points:
            d = self._distance_to(query, query_norm, ep)
            heapq.heappush(candidates, (d, ep))
            if ep not in self._deleted:
                heapq.heappush(found, (-d, ep))

        while candidates:
            cur_dist, cur_id = heapq.heappop(candidates)
            if found and len(found) >= ef and cur_dist > -found[0][0]:
                break

            neighbor_ids = [
                nid for nid in self._graph.get(cur_id, {}).get(level, []) if nid not in visited
            ]
            if not neighbor_ids:
                continue
            visited.update(neighbor_ids)

            dists = self._distance_batch(query, query_norm, neighbor_ids)
            for nid, d in zip(neighbor_ids, dists, strict=True):
                d = float(d)
                heapq.heappush(candidates, (d, nid))
                if nid in self._deleted:
                    continue
                if len(found) < ef or d < -found[0][0]:
                    heapq.heappush(found, (-d, nid))
                    if len(found) > ef:
                        heapq.heappop(found)

        return sorted(((-nd, nid) for nd, nid in found), key=lambda pair: pair[0])

    def _prune_neighbors(self, node_id: str, level: int, max_conn: int) -> None:
        """Keep only the `max_conn` closest neighbors of `node_id` at `level`."""
        neighbor_ids = self._graph[node_id][level]
        if len(neighbor_ids) <= max_conn:
            return
        node_norm = self._norms.get(node_id, 0.0) if self._metric_kind == "cosine" else 0.0
        dists = self._distance_batch(self._embeddings[node_id], node_norm, neighbor_ids)
        keep = np.argsort(dists)[:max_conn]
        self._graph[node_id][level] = [neighbor_ids[i] for i in keep]

    def _insert(self, vec: Vector) -> None:
        vid = vec.id

        if vid in self._levels:
            # Upsert of an existing vector: its embedding (and therefore its
            # ideal graph position) changed, so tombstone the old node and
            # insert a fresh one rather than trying to reposition it in place.
            # Without the rebuild check here, an id that's repeatedly
            # re-upserted (never `remove()`d) would tombstone a new node every
            # time and never trip `rebuild_threshold` — `_levels`/`_graph`
            # would grow unboundedly even though `size` stays constant.
            self._soft_delete(vid)
            self._maybe_rebuild()

        self._vectors[vid] = vec
        self._register_embedding(vid, vec.embedding)
        self._deleted.discard(vid)

        level = self._random_level()
        self._levels[vid] = level
        self._graph[vid] = {lvl: [] for lvl in range(level + 1)}

        if self._entry_point is None:
            self._entry_point = vid
            self._max_level = level
            return

        query = vec.embedding
        query_norm = self._query_norm(query)
        cur = self._entry_point

        # Descend from the top layer to just above the new node's top layer,
        # greedily walking to the single closest node at each layer (ef=1).
        for lvl in range(self._max_level, level, -1):
            nearest = self._search_layer(query, query_norm, [cur], ef=1, level=lvl)
            if nearest:
                cur = nearest[0][1]

        # From min(level, max_level) down to 0, find ef_construction candidates,
        # connect to the closest m of them, and prune any neighbor whose
        # degree now exceeds its layer's cap.
        for lvl in range(min(level, self._max_level), -1, -1):
            candidates = self._search_layer(
                query, query_norm, [cur], ef=self.ef_construction, level=lvl
            )
            neighbors = [nid for _, nid in candidates[: self.m]]
            self._graph[vid][lvl] = list(neighbors)

            max_conn = self.m_max0 if lvl == 0 else self.m
            for nid in neighbors:
                self._graph[nid].setdefault(lvl, [])
                self._graph[nid][lvl].append(vid)
                if len(self._graph[nid][lvl]) > max_conn:
                    self._prune_neighbors(nid, lvl, max_conn)

            if candidates:
                cur = candidates[0][1]

        if level > self._max_level:
            self._max_level = level
            self._entry_point = vid

    def _soft_delete(self, vid: str) -> None:
        self._deleted.add(vid)
        self._vectors.pop(vid, None)
        if self._entry_point == vid:
            self._pick_new_entry_point()

    def _pick_new_entry_point(self) -> None:
        live = [nid for nid in self._levels if nid not in self._deleted]
        if not live:
            self._entry_point = None
            self._max_level = -1
            return
        self._entry_point = max(live, key=lambda nid: self._levels[nid])
        self._max_level = self._levels[self._entry_point]

    def _maybe_rebuild(self) -> None:
        """Rebuild once tombstones cross `rebuild_threshold` of all graph nodes."""
        total = len(self._levels)
        if total > 0 and len(self._deleted) / total >= self.rebuild_threshold:
            self._rebuild()

    def _rebuild(self) -> None:
        """Rebuild the graph from scratch using only the surviving vectors."""
        remaining = list(self._vectors.values())
        self._graph.clear()
        self._levels.clear()
        self._embeddings.clear()
        self._norms.clear()
        self._deleted.clear()
        self._vectors.clear()
        self._entry_point = None
        self._max_level = -1
        for vec in remaining:
            self._insert(vec)
