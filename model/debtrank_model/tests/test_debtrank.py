"""Correctness tests for DebtRank.

These are hand-derivable toy networks (not literature reproductions we can't
verify offline) small enough that the expected propagation can be computed
by hand and checked against the implementation.
"""

import numpy as np
import pytest

from debtrank_model.debtrank import run_debtrank
from debtrank_model.network import ExposureNetwork


def test_no_shock_means_no_impact():
    net = ExposureNetwork(
        node_ids=["A", "B"],
        exposure=np.array([[0.0, 50.0], [0.0, 0.0]]),
        equity=np.array([100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={})
    assert np.allclose(result.final_distress, [0.0, 0.0])
    assert result.debtrank == pytest.approx(0.0)


def test_isolated_node_only_carries_its_own_shock():
    # C has no exposure to/from anyone: shocking it should not affect A or B,
    # and its own final distress should equal exactly the initial shock.
    net = ExposureNetwork(
        node_ids=["A", "B", "C"],
        exposure=np.array([
            [0.0, 50.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
        ]),
        equity=np.array([100.0, 100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={"C": 0.6})
    assert result.final_distress[net.node_ids.index("A")] == pytest.approx(0.0)
    assert result.final_distress[net.node_ids.index("B")] == pytest.approx(0.0)
    assert result.final_distress[net.node_ids.index("C")] == pytest.approx(0.6)


def test_two_node_one_way_propagation():
    # B is exposed to A for exactly half of B's equity (impact fraction 0.5).
    # A defaults fully (shock=1.0) -> B should absorb exactly 0.5 distress,
    # and since A has zero exposure to B, distress does not reverberate back.
    net = ExposureNetwork(
        node_ids=["A", "B"],
        exposure=np.array([
            [0.0, 0.0],
            [50.0, 0.0],  # B (row) is exposed to A (col) for 50
        ]),
        equity=np.array([100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={"A": 1.0})

    assert result.final_distress[net.node_ids.index("A")] == pytest.approx(1.0)
    assert result.final_distress[net.node_ids.index("B")] == pytest.approx(0.5)
    # debtrank = sum((h_final - h_initial) * v); only B's distress is "new",
    # and v_A == v_B == 0.5 since equity is equal.
    assert result.debtrank == pytest.approx(0.5 * 0.5)


def test_exposure_capped_at_full_equity_loss():
    # B's exposure to A exceeds B's entire equity -> impact fraction caps at 1,
    # so a full default of A can wipe out at most all of B's equity (distress 1.0),
    # never more.
    net = ExposureNetwork(
        node_ids=["A", "B"],
        exposure=np.array([
            [0.0, 0.0],
            [500.0, 0.0],  # far more than B's equity of 100
        ]),
        equity=np.array([100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={"A": 1.0})
    assert result.final_distress[net.node_ids.index("B")] == pytest.approx(1.0)


def test_partial_shock_scales_linearly_through_one_hop():
    net = ExposureNetwork(
        node_ids=["A", "B"],
        exposure=np.array([
            [0.0, 0.0],
            [50.0, 0.0],
        ]),
        equity=np.array([100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={"A": 0.4})
    # impact fraction is 0.5, so B's distress should be 0.5 * 0.4 = 0.2
    assert result.final_distress[net.node_ids.index("B")] == pytest.approx(0.2)
