import numpy as np
import pytest

from debtrank_model import EQUITY_FLOOR_USD, build_exposure_network, node_equity


def snapshot(**overrides):
    base = {
        "nodes": [
            {"id": "AAA", "gdp_usd": 1e12, "reserves_usd": 2e11,
             "external_debt_usd": None, "bank_capital_ratio_pct": None},
            {"id": "BBB", "gdp_usd": 1e12, "reserves_usd": 1e11,
             "external_debt_usd": None, "bank_capital_ratio_pct": None},
        ],
        "edges": [{"creditor": "AAA", "debtor": "BBB", "amount": 3e10}],
    }
    base.update(overrides)
    return base


class TestNodeEquity:
    def test_prefers_reserves_when_they_are_the_largest_buffer(self):
        node = {"reserves_usd": 5e11, "gdp_usd": 1e12, "bank_capital_ratio_pct": None}
        assert node_equity(node, gross_footprint=0.0) == 5e11

    def test_falls_back_to_one_percent_of_gdp(self):
        node = {"reserves_usd": None, "gdp_usd": 1e12, "bank_capital_ratio_pct": None}
        assert node_equity(node, gross_footprint=0.0) == pytest.approx(1e10)

    def test_uses_the_countrys_own_capital_ratio_against_its_footprint(self):
        # A financial centre: no GDP or reserves reported, but a large
        # cross-border footprint -- the case the floor exists for.
        node = {"reserves_usd": None, "gdp_usd": None, "bank_capital_ratio_pct": 10.0}
        assert node_equity(node, gross_footprint=4e11) == pytest.approx(4e10)

    def test_defaults_to_basel_iii_when_no_ratio_is_reported(self):
        node = {"reserves_usd": None, "gdp_usd": None, "bank_capital_ratio_pct": None}
        assert node_equity(node, gross_footprint=1e12) == pytest.approx(8e10)

    def test_never_returns_a_non_positive_buffer(self):
        # ExposureNetwork rejects equity <= 0, so the floor is what keeps a
        # node with no data at all from making the whole network unusable.
        assert node_equity({}, gross_footprint=0.0) == EQUITY_FLOOR_USD


class TestBuildExposureNetwork:
    def test_places_the_creditors_claim_on_the_debtor(self):
        net = build_exposure_network(snapshot())
        i, j = net.node_ids.index("AAA"), net.node_ids.index("BBB")
        assert net.exposure[i, j] == 3e10
        assert net.exposure[j, i] == 0.0

    def test_ignores_edges_naming_a_country_with_no_node(self):
        net = build_exposure_network(
            snapshot(edges=[{"creditor": "AAA", "debtor": "ZZZ", "amount": 9e9}])
        )
        assert np.all(net.exposure == 0)

    def test_portfolio_edges_are_off_by_default(self):
        snap = snapshot(portfolio_edges=[{"creditor": "BBB", "debtor": "AAA", "amount": 7e10}])
        net = build_exposure_network(snap)
        i, j = net.node_ids.index("BBB"), net.node_ids.index("AAA")
        assert net.exposure[i, j] == 0.0

    def test_portfolio_edges_join_the_same_matrix_when_asked(self):
        snap = snapshot(portfolio_edges=[{"creditor": "BBB", "debtor": "AAA", "amount": 7e10}])
        net = build_exposure_network(snap, include_portfolio=True)
        i, j = net.node_ids.index("BBB"), net.node_ids.index("AAA")
        assert net.exposure[i, j] == 7e10

    def test_portfolio_edges_do_not_move_the_equity_buffer(self):
        # Mirrors web/src/lib/network.ts: the toggle must not change a
        # node's loss buffer, or the two runs stop being comparable.
        snap = snapshot(portfolio_edges=[{"creditor": "BBB", "debtor": "AAA", "amount": 7e13}])
        assert np.array_equal(
            build_exposure_network(snap).equity,
            build_exposure_network(snap, include_portfolio=True).equity,
        )
