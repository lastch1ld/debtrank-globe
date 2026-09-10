"""Correctness tests for DebtRank.

These are hand-derivable toy networks (not literature reproductions we can't
verify offline) small enough that the expected propagation can be computed
by hand and checked against the implementation.
"""

import numpy as np
import pytest

from debtrank_model.debtrank import Shock, run_debtrank
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


def test_inactive_node_distress_stays_frozen_on_reverberation():
    # X and Y are reciprocally exposed to each other, each for exactly half
    # of their own equity (impact fraction 0.5 both ways). X is partially
    # shocked (0.5, not a full default), so X's own distress must stay at
    # exactly 0.5 for the rest of the run -- once X propagates to Y and goes
    # INACTIVE, Y's later propagation back to X must NOT add to X's h.
    net = ExposureNetwork(
        node_ids=["X", "Y"],
        exposure=np.array([
            [0.0, 50.0],  # X's claim on Y: 50 (impact fraction 0.5 of X's equity)
            [50.0, 0.0],  # Y's claim on X: 50 (impact fraction 0.5 of Y's equity)
        ]),
        equity=np.array([100.0, 100.0]),
    )
    result = run_debtrank(net, shocked_nodes={"X": 0.5})

    # Round 1: X (D, h=0.5) propagates to Y -> h_Y = 0.5*0.5 = 0.25, X -> INACTIVE.
    # Round 2: Y (D) propagates back to X, but X is INACTIVE so its h must
    # stay frozen at 0.5, not climb to 0.625.
    assert result.final_distress[net.node_ids.index("X")] == pytest.approx(0.5)
    assert result.final_distress[net.node_ids.index("Y")] == pytest.approx(0.25)
    # debtrank = sum((h_final - h_initial) * v); only Y's distress is "new"
    # (X's h didn't change from its initial shock), v_X == v_Y == 0.5.
    assert result.debtrank == pytest.approx(0.25 * 0.5)


class TestSequentialShocks:
    """A chain A -> B -> C: A holds a claim on B, B on C."""

    @staticmethod
    def chain():
        exposure = np.array(
            [
                [0.0, 50.0, 0.0],
                [0.0, 0.0, 50.0],
                [0.0, 0.0, 0.0],
            ]
        )
        return ExposureNetwork(
            node_ids=["A", "B", "C"], exposure=exposure, equity=np.array([100.0, 100.0, 100.0])
        )

    def test_a_bare_float_still_means_an_immediate_shock(self):
        net = self.chain()
        assert run_debtrank(net, {"C": 1.0}).debtrank == pytest.approx(
            run_debtrank(net, {"C": Shock(level=1.0)}).debtrank
        )

    def test_a_delayed_shock_lands_in_the_round_it_names(self):
        net = self.chain()
        result = run_debtrank(net, {"C": 1.0, "A": Shock(level=0.4, delay=2)})
        assert result.history[0][net.node_ids.index("A")] == 0.0
        assert result.history[2][net.node_ids.index("A")] == pytest.approx(0.4)

    def test_a_late_shock_still_propagates_through_a_spent_node(self):
        # B is knocked INACTIVE by the first wave from C. A second,
        # exogenous shock to B is new information, not recirculated
        # distress, so it must still reach A -- otherwise sequencing
        # silently does nothing in exactly the case it exists for.
        net = self.chain()
        first_wave_only = run_debtrank(net, {"C": 1.0})
        sequenced = run_debtrank(net, {"C": 1.0, "B": Shock(level=1.0, delay=2)})
        a = net.node_ids.index("A")
        assert sequenced.final_distress[a] > first_wave_only.final_distress[a]

    def test_the_aggregate_never_counts_a_shock_as_its_own_impact(self):
        # Injecting distress directly into an isolated node must not move
        # the aggregate, whenever it arrives.
        net = ExposureNetwork(
            node_ids=["A", "B"],
            exposure=np.zeros((2, 2)),
            equity=np.array([100.0, 100.0]),
        )
        assert run_debtrank(net, {"A": 1.0}).debtrank == pytest.approx(0.0)
        assert run_debtrank(net, {"A": Shock(level=1.0, delay=3)}).debtrank == pytest.approx(0.0)

    def test_rejects_a_negative_delay(self):
        with pytest.raises(ValueError, match="delay"):
            run_debtrank(self.chain(), {"A": Shock(level=0.5, delay=-1)})
