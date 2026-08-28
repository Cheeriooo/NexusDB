"""Concurrency stress tests for FlatIndex / Collection.

These exercise the race the roadmap calls out explicitly: a search reading
`_matrix` (and, prior to the fix, `_vectors`) while a concurrent add/remove
mutates the index. Threaded rather than mocked — a broken lock only shows up
under real concurrent execution.
"""

import threading

import numpy as np

from nexusdb.core.collection import Collection
from nexusdb.core.index.flat_index import FlatIndex
from nexusdb.core.vector import Vector

DIM = 8
N_WRITERS = 4
N_READERS = 4
OPS_PER_THREAD = 200


def _make_vector(i: int) -> Vector:
    rng = np.random.default_rng(i)
    return Vector(embedding=rng.standard_normal(DIM).astype(np.float32), id=f"v{i}")


def test_concurrent_add_search_remove_does_not_corrupt_index():
    index = FlatIndex(dimension=DIM, metric="cosine")
    errors: list[Exception] = []
    stop = threading.Event()

    def writer(thread_id: int):
        try:
            for i in range(OPS_PER_THREAD):
                vid = thread_id * OPS_PER_THREAD + i
                index.add([_make_vector(vid)])
                if i % 3 == 0:
                    index.remove(f"v{vid}")
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    def reader():
        query = np.zeros(DIM, dtype=np.float32)
        while not stop.is_set():
            try:
                results = index.search(query, k=5)
                # Every result must reference a real, dimension-correct vector,
                # or None — never raise, never a half-constructed object.
                for r in results:
                    assert r.id
                    assert isinstance(r.distance, float)
                    if r.vector is not None:
                        assert r.vector.dimension == DIM
            except Exception as e:  # noqa: BLE001
                errors.append(e)

    readers = [threading.Thread(target=reader) for _ in range(N_READERS)]
    writers = [threading.Thread(target=writer, args=(t,)) for t in range(N_WRITERS)]

    for t in readers + writers:
        t.start()
    for t in writers:
        t.join()
    stop.set()
    for t in readers:
        t.join()

    assert errors == []
    # Every writer added OPS_PER_THREAD vectors and removed roughly a third.
    assert index.size > 0


def test_concurrent_collection_upsert_is_thread_safe():
    col = Collection(name="stress", dimension=DIM, metric="cosine")
    errors: list[Exception] = []

    def worker(thread_id: int):
        try:
            for i in range(OPS_PER_THREAD):
                vid = thread_id * OPS_PER_THREAD + i
                col.add([_make_vector(vid)])
                col.search([0.0] * DIM, k=3)
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(N_WRITERS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    assert col.count == N_WRITERS * OPS_PER_THREAD
