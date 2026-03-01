"""Distance / similarity metrics for vector search."""

from __future__ import annotations

from typing import Callable

import numpy as np


def cosine_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute cosine distance between query vector `a` and matrix `b`.

    cosine_distance = 1 - cosine_similarity

    Args:
        a: Query vector of shape (D,).
        b: Matrix of candidate vectors, shape (N, D).

    Returns:
        Array of shape (N,) with cosine distances in [0, 2].
    """
    if b.ndim == 1:
        b = b.reshape(1, -1)

    # Norms
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b, axis=1)

    # Avoid division by zero
    if norm_a == 0:
        return np.ones(b.shape[0], dtype=np.float32)

    safe_norm_b = np.where(norm_b == 0, 1.0, norm_b)
    similarity = np.dot(b, a) / (norm_a * safe_norm_b)

    # Clamp to [-1, 1] to handle floating-point errors
    similarity = np.clip(similarity, -1.0, 1.0)

    return (1.0 - similarity).astype(np.float32)


def euclidean_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute L2 (Euclidean) distance between query vector `a` and matrix `b`.

    Args:
        a: Query vector of shape (D,).
        b: Matrix of candidate vectors, shape (N, D).

    Returns:
        Array of shape (N,) with Euclidean distances (>= 0).
    """
    if b.ndim == 1:
        b = b.reshape(1, -1)

    diff = b - a
    return np.linalg.norm(diff, axis=1).astype(np.float32)


def dot_product_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute negative dot-product distance (lower = more similar).

    Using negative so that the "nearest neighbor" convention (lower is better)
    is preserved consistently across all metrics.

    Args:
        a: Query vector of shape (D,).
        b: Matrix of candidate vectors, shape (N, D).

    Returns:
        Array of shape (N,) with negative inner products.
    """
    if b.ndim == 1:
        b = b.reshape(1, -1)

    return (-np.dot(b, a)).astype(np.float32)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_METRIC_REGISTRY: dict[str, Callable] = {
    "cosine": cosine_distance,
    "euclidean": euclidean_distance,
    "l2": euclidean_distance,
    "dot": dot_product_distance,
    "inner_product": dot_product_distance,
}

SUPPORTED_METRICS = list(_METRIC_REGISTRY.keys())


def get_distance_fn(metric: str) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """Return the distance function for the given metric name.

    Supported metrics: cosine, euclidean (l2), dot (inner_product).

    Raises:
        ValueError: If the metric is not supported.
    """
    metric = metric.lower().strip()
    if metric not in _METRIC_REGISTRY:
        raise ValueError(
            f"Unknown metric '{metric}'. Supported: {SUPPORTED_METRICS}"
        )
    return _METRIC_REGISTRY[metric]
