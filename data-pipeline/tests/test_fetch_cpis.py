from fetch_cpis import _is_country_code, edges_from_series


class TestIsCountryCode:
    def test_two_letter_code_is_a_country(self):
        assert _is_country_code("DE") is True

    def test_aggregate_code_is_not_a_country(self):
        assert _is_country_code("1A") is False
        assert _is_country_code("1C_031") is False
        assert _is_country_code("W00") is False


class TestEdgesFromSeries:
    def _doc(self, counterpart: str, periods: list[str], values: list) -> dict:
        return {
            "dimensions": {"COUNTERPART_AREA": counterpart},
            "period": periods,
            "value": values,
        }

    def test_extracts_edge_for_requested_year(self):
        docs = [self._doc("FR", ["2022", "2023"], [100.0, 120.0])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == [{"creditor": "DE", "debtor": "FR", "amount": 120.0}]

    def test_years_outside_the_requested_range_are_dropped(self):
        docs = [self._doc("FR", ["2023"], [120.0])]
        by_year = edges_from_series("DE", docs, {2024})
        assert by_year[2024] == []

    def test_null_observation_yields_no_edge(self):
        docs = [self._doc("FR", ["2023"], [None])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == []

    def test_negative_value_yields_no_edge(self):
        docs = [self._doc("FR", ["2023"], [-5.0])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == []

    def test_na_sentinel_string_yields_no_edge(self):
        # DBnomics represents confidential/unavailable CPIS observations as
        # the literal string "NA" mixed into an otherwise-numeric value array.
        docs = [self._doc("FR", ["2023"], ["NA"])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == []

    def test_semi_annual_period_is_not_treated_as_a_year(self):
        # A handful of early CPIS observations are semi-annual ("1997-S2")
        # rather than annual.
        docs = [self._doc("FR", ["1997-S2", "2023"], [50.0, 120.0])]
        by_year = edges_from_series("DE", docs, {1997, 2023})
        assert by_year[1997] == []
        assert by_year[2023] == [{"creditor": "DE", "debtor": "FR", "amount": 120.0}]

    def test_aggregate_counterpart_is_excluded(self):
        docs = [self._doc("1A", ["2023"], [100.0])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == []

    def test_self_loop_is_excluded(self):
        docs = [self._doc("DE", ["2023"], [100.0])]
        by_year = edges_from_series("DE", docs, {2023})
        assert by_year[2023] == []
