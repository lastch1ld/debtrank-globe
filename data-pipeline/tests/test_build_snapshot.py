from build_snapshot import MAX_CARRY_FORWARD_YEARS, _last_observation_carried_forward, _map_edges_to_iso3


def _node(years: dict[str, dict]) -> dict:
    return {"id": "TST", "name": "Testland", "lat": 0, "lng": 0, "years": years}


ISO2_TO_ISO3 = {"DE": "DEU", "FR": "FRA"}


class TestMapEdgesToIso3:
    def test_maps_known_pair_to_iso3(self):
        edges = _map_edges_to_iso3(
            [{"creditor": "DE", "debtor": "FR", "amount": 100.0}],
            ISO2_TO_ISO3,
            {"DEU", "FRA"},
        )
        assert edges == [{"creditor": "DEU", "debtor": "FRA", "amount": 100.0}]

    def test_drops_edge_with_unmapped_iso2_code(self):
        edges = _map_edges_to_iso3(
            [{"creditor": "5J", "debtor": "FR", "amount": 100.0}],
            ISO2_TO_ISO3,
            {"DEU", "FRA"},
        )
        assert edges == []

    def test_drops_edge_whose_iso3_has_no_node(self):
        edges = _map_edges_to_iso3(
            [{"creditor": "DE", "debtor": "FR", "amount": 100.0}],
            ISO2_TO_ISO3,
            {"DEU"},  # FRA has no node this year
        )
        assert edges == []

    def test_period_field_is_carried_through_when_present(self):
        edges = _map_edges_to_iso3(
            [{"creditor": "DE", "debtor": "FR", "amount": 100.0, "period": "2023-Q4"}],
            ISO2_TO_ISO3,
            {"DEU", "FRA"},
        )
        assert edges == [{"creditor": "DEU", "debtor": "FRA", "amount": 100.0, "period": "2023-Q4"}]


class TestLastObservationCarriedForward:
    def test_value_present_is_used_as_is(self):
        node = _node({"2025": {"gdp_usd": 100, "reserves_usd": None, "external_debt_usd": None,
                                "bank_capital_ratio_pct": None}})
        result = _last_observation_carried_forward(node, "2025")
        assert result["gdp_usd"] == 100

    def test_missing_value_fills_from_most_recent_prior_year(self):
        node = _node({
            "2023": {"gdp_usd": None, "reserves_usd": 50, "external_debt_usd": None, "bank_capital_ratio_pct": None},
            "2025": {"gdp_usd": None, "reserves_usd": None, "external_debt_usd": None, "bank_capital_ratio_pct": None},
        })
        result = _last_observation_carried_forward(node, "2025")
        assert result["reserves_usd"] == 50

    def test_prefers_closer_year_over_older_one(self):
        node = _node({
            "2022": {"gdp_usd": None, "reserves_usd": 10, "external_debt_usd": None, "bank_capital_ratio_pct": None},
            "2024": {"gdp_usd": None, "reserves_usd": 20, "external_debt_usd": None, "bank_capital_ratio_pct": None},
            "2025": {"gdp_usd": None, "reserves_usd": None, "external_debt_usd": None, "bank_capital_ratio_pct": None},
        })
        result = _last_observation_carried_forward(node, "2025")
        assert result["reserves_usd"] == 20

    def test_does_not_fill_beyond_the_cap(self):
        stale_year = str(2025 - (MAX_CARRY_FORWARD_YEARS + 1))
        node = _node({
            stale_year: {"gdp_usd": None, "reserves_usd": 999, "external_debt_usd": None, "bank_capital_ratio_pct": None},
            "2025": {"gdp_usd": None, "reserves_usd": None, "external_debt_usd": None, "bank_capital_ratio_pct": None},
        })
        result = _last_observation_carried_forward(node, "2025")
        assert result["reserves_usd"] is None

    def test_fills_at_exactly_the_cap_boundary(self):
        boundary_year = str(2025 - MAX_CARRY_FORWARD_YEARS)
        node = _node({
            boundary_year: {"gdp_usd": None, "reserves_usd": 42, "external_debt_usd": None, "bank_capital_ratio_pct": None},
            "2025": {"gdp_usd": None, "reserves_usd": None, "external_debt_usd": None, "bank_capital_ratio_pct": None},
        })
        result = _last_observation_carried_forward(node, "2025")
        assert result["reserves_usd"] == 42

    def test_each_field_filled_independently(self):
        node = _node({
            "2024": {"gdp_usd": 5, "reserves_usd": None, "external_debt_usd": 7, "bank_capital_ratio_pct": None},
            "2025": {"gdp_usd": None, "reserves_usd": 3, "external_debt_usd": None, "bank_capital_ratio_pct": None},
        })
        result = _last_observation_carried_forward(node, "2025")
        assert result == {"gdp_usd": 5, "reserves_usd": 3, "external_debt_usd": 7, "bank_capital_ratio_pct": None}

    def test_missing_year_entry_entirely_still_returns_a_dict(self):
        node = _node({})
        result = _last_observation_carried_forward(node, "2025")
        assert result == {}
