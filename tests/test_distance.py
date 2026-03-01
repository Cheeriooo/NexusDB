"""Tests for distance / similarity metrics."""

import numpy as np
import pytest

from nexusdb.utils.distance import (
    cosine_distance,
    dot_product_distance,
    euclidean_distance,
    get_distance_fn,
    SUPPORTED_METRICS,
)


class TestCosineDistance:

    def test_identical_vectors(self):
        a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        b = np.array([[1.0, 0.0, 0.0]], dtype=np.float32)
        d = cosine_distance(a, b)
        assert d.shape == (1,)
        assert abs(d[0]) < 1e-6  # distance ≈ 0

    def test_orthogonal_vectors(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([[0.0, 1.0]], dtype=np.float32)
        d = cosine_distance(a, b)
        assert abs(d[0] - 1.0) < 1e-6  # distance = 1

    def test_opposite_vectors(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([[-1.0, 0.0]], dtype=np.float32)
        d = cosine_distance(a, b)
        assert abs(d[0] - 2.0) < 1e-6  # distance = 2

    def test_batch(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([
            [1.0, 0.0],
            [0.0, 1.0],
            [-1.0, 0.0],
        ], dtype=np.float32)
        d = cosine_distance(a, b)
        assert d.shape == (3,)
        np.testing.assert_array_almost_equal(d, [0.0, 1.0, 2.0], decimal=5)

    def test_zero_query(self):
        a = np.array([0.0, 0.0], dtype=np.float32)
        b = np.array([[1.0, 0.0]], dtype=np.float32)
        d = cosine_distance(a, b)
        assert d[0] == 1.0  # defined fallback

    def test_1d_input(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([1.0, 0.0], dtype=np.float32)
        d = cosine_distance(a, b)
        assert d.shape == (1,)


class TestEuclideanDistance:

    def test_identical(self):
        a = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        b = np.array([[1.0, 2.0, 3.0]], dtype=np.float32)
        d = euclidean_distance(a, b)
        assert abs(d[0]) < 1e-6

    def test_known_distance(self):
        a = np.array([0.0, 0.0], dtype=np.float32)
        b = np.array([[3.0, 4.0]], dtype=np.float32)
        d = euclidean_distance(a, b)
        assert abs(d[0] - 5.0) < 1e-5  # 3-4-5 triangle

    def test_batch(self):
        a = np.array([0.0, 0.0], dtype=np.float32)
        b = np.array([[3.0, 4.0], [0.0, 0.0]], dtype=np.float32)
        d = euclidean_distance(a, b)
        assert abs(d[0] - 5.0) < 1e-5
        assert abs(d[1]) < 1e-6


class TestDotProductDistance:

    def test_identical_unit(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([[1.0, 0.0]], dtype=np.float32)
        d = dot_product_distance(a, b)
        assert abs(d[0] - (-1.0)) < 1e-6  # -dot = -1

    def test_orthogonal(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([[0.0, 1.0]], dtype=np.float32)
        d = dot_product_distance(a, b)
        assert abs(d[0]) < 1e-6  # -dot = 0

    def test_batch(self):
        a = np.array([2.0, 3.0], dtype=np.float32)
        b = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
        d = dot_product_distance(a, b)
        np.testing.assert_array_almost_equal(d, [-2.0, -3.0], decimal=5)


class TestGetDistanceFn:

    def test_cosine(self):
        fn = get_distance_fn("cosine")
        assert fn is cosine_distance

    def test_euclidean(self):
        fn = get_distance_fn("euclidean")
        assert fn is euclidean_distance

    def test_l2_alias(self):
        fn = get_distance_fn("l2")
        assert fn is euclidean_distance

    def test_dot(self):
        fn = get_distance_fn("dot")
        assert fn is dot_product_distance

    def test_inner_product_alias(self):
        fn = get_distance_fn("inner_product")
        assert fn is dot_product_distance

    def test_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown metric"):
            get_distance_fn("hamming")

    def test_case_insensitive(self):
        fn = get_distance_fn("COSINE")
        assert fn is cosine_distance
