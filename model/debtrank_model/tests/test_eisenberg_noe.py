"""Correctness tests for the Eisenberg-Noe clearing vector, using small
hand-solvable networks.
"""

import numpy as np
import pytest

from debtrank_model.eisenberg_noe import clearing_vector


def test_solvent_node_pays_in_full():
    # X owes Y 100, and has 150 in external assets -> can pay in full.
    liabilities = np.array([
        [0.0, 100.0],
        [0.0, 0.0],
    ])
    external_assets = np.array([150.0, 0.0])
    result = clearing_vector(["X", "Y"], liabilities, external_assets)
    assert result.payments[0] == pytest.approx(100.0)
    assert result.payments[1] == pytest.approx(0.0)  # Y owes nothing


def test_insolvent_node_pays_only_available_assets():
    # X owes Y 100 but only has 40 in external assets and receives nothing
    # back (Y owes X nothing) -> X can only pay 40.
    liabilities = np.array([
        [0.0, 100.0],
        [0.0, 0.0],
    ])
    external_assets = np.array([40.0, 0.0])
    result = clearing_vector(["X", "Y"], liabilities, external_assets)
    assert result.payments[0] == pytest.approx(40.0)
    assert result.payments[1] == pytest.approx(0.0)
    assert result.shortfall()[0] == pytest.approx(60.0)


def test_mutual_offsetting_liabilities_both_pay_in_full():
    # X owes Y 100 and Y owes X 100 (equal mutual claims), both start with
    # zero external assets -> the netting mechanism should still let each
    # party pay its 100, since each receives exactly what it needs from the other.
    liabilities = np.array([
        [0.0, 100.0],
        [100.0, 0.0],
    ])
    external_assets = np.array([0.0, 0.0])
    result = clearing_vector(["X", "Y"], liabilities, external_assets)
    assert result.payments[0] == pytest.approx(100.0)
    assert result.payments[1] == pytest.approx(100.0)


def test_three_node_cascade_default():
    # A owes B 100 with only 20 external assets (A defaults hard).
    # B owes C 100 but has 90 external assets; B's ability to pay C depends
    # on what it recovers from A.
    # Expected: A pays min(100, 20) = 20.
    # B receives all of A's liability share (100% of A's 100 owed to B) = 20,
    # so B can pay min(100, 90 + 20) = 100 (fully solvent once it recovers).
    liabilities = np.array([
        [0.0, 100.0, 0.0],
        [0.0, 0.0, 100.0],
        [0.0, 0.0, 0.0],
    ])
    external_assets = np.array([20.0, 90.0, 0.0])
    result = clearing_vector(["A", "B", "C"], liabilities, external_assets)
    assert result.payments[0] == pytest.approx(20.0)
    assert result.payments[1] == pytest.approx(100.0)
    assert result.payments[2] == pytest.approx(0.0)  # C owes nothing
