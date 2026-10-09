import json

import numpy as np
import pytest

from debtrank_model import ExposureNetwork, clearing_vector, run_debtrank
from debtrank_model.tests.make_golden import GOLDEN, GOLDEN_EN, build_cases, build_en_cases


def test_golden_file_is_current():
    # Fails if the model changes without a reviewed regeneration of the file
    # the TS port is checked against.
    # Inputs must match exactly; results only to float precision, since numpy
    # builds differ in the last digit across platforms.
    for have, want in zip(json.loads(GOLDEN.read_text()), build_cases(), strict=True):
        for key in ("nodeIds", "exposure", "equity", "shocks"):
            assert have[key] == json.loads(json.dumps(want[key]))
        assert have["finalDistress"] == pytest.approx(want["finalDistress"], abs=1e-12)
        assert have["debtrank"] == pytest.approx(want["debtrank"], abs=1e-12)


def _random_net(rng):
    n = int(rng.integers(3, 9))
    exposure = rng.uniform(0, 80, (n, n)) * (rng.random((n, n)) < 0.5)
    np.fill_diagonal(exposure, 0)
    return ExposureNetwork([f"N{i}" for i in range(n)], exposure, rng.uniform(40, 120, n))


def test_distress_properties():
    rng = np.random.default_rng(1)
    for _ in range(50):
        net = _random_net(rng)
        node = net.node_ids[int(rng.integers(net.n))]
        assert not run_debtrank(net, {}).final_distress.any()
        lo, hi = sorted(rng.uniform(0.05, 1, 2))
        a = run_debtrank(net, {node: lo}).final_distress
        b = run_debtrank(net, {node: hi}).final_distress
        assert ((0 <= a) & (a <= 1)).all() and ((0 <= b) & (b <= 1)).all()
        assert (b >= a - 1e-12).all()  # monotone in shock size


def test_eisenberg_noe_golden_file_is_current():
    for have, want in zip(json.loads(GOLDEN_EN.read_text()), build_en_cases(), strict=True):
        for key in ("nodeIds", "liabilities", "externalAssets"):
            assert have[key] == json.loads(json.dumps(want[key]))
        assert have["payments"] == pytest.approx(want["payments"], abs=1e-9)
        assert have["nominalLiabilities"] == pytest.approx(want["nominalLiabilities"], abs=1e-9)


def _random_liabilities(rng):
    n = int(rng.integers(3, 9))
    liabilities = rng.uniform(0, 100, (n, n)) * (rng.random((n, n)) < 0.5)
    np.fill_diagonal(liabilities, 0)
    return [f"N{i}" for i in range(n)], liabilities, rng.uniform(0, 60, n)


def test_clearing_vector_properties():
    rng = np.random.default_rng(2)
    for _ in range(50):
        ids, liabilities, external = _random_liabilities(rng)
        res = clearing_vector(ids, liabilities, external)
        p, p_bar = res.payments, res.nominal_liabilities
        # nobody pays less than nothing or more than they owe
        assert (p >= -1e-12).all() and (p <= p_bar + 1e-9).all()
        # it is a fixed point: p_i = min(p_bar_i, e_i + what the others pay i)
        pi = np.where(p_bar[:, None] > 0, liabilities / np.where(p_bar[:, None] > 0, p_bar[:, None], 1), 0.0)
        assert p == pytest.approx(np.minimum(p_bar, external + pi.T @ p), abs=1e-8)
        # more outside money never makes anyone pay less
        richer = clearing_vector(ids, liabilities, external + rng.uniform(0, 30, len(ids))).payments
        assert (richer >= p - 1e-8).all()
