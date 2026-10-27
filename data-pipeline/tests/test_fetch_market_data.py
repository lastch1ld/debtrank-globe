"""The market-data builder, against canned OECD SDMX-CSV: no network."""
import json
from pathlib import Path

import pytest
import requests

import fetch_market_data as fmd

HEADER = "DATAFLOW,REF_AREA,FREQ,MEASURE,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE,OBS_STATUS\n"


def csv_of(*rows):
    return HEADER + "".join(f"X,{a},M,M,PA,{t},{v},A\n" for a, t, v in rows)


class TestParseDecemberValues:
    def test_keeps_only_december_values_by_country_and_year(self):
        got = fmd.parse_december_values(csv_of(("USA", "2005-11", "4.54"), ("USA", "2005-12", "4.47"), ("DEU", "2006-12", "3.8")))
        assert got == {"USA": {2005: 4.47}, "DEU": {2006: 3.8}}

    def test_skips_blank_values(self):
        assert fmd.parse_december_values(csv_of(("USA", "2005-12", ""))) == {}

    def test_keeps_the_aggregate_for_the_caller_to_drop(self):
        assert "EA20" in fmd.parse_december_values(csv_of(("EA20", "2005-12", "3.4")))


class TestBuildMarketData:
    levels = {
        "bond_yield_pct": {"USA": {2005: 4.47, 2006: 4.8}, "EA20": {2005: 3.4}},
        "policy_rate_pct": {"USA": {2005: 4.16}},
    }
    share = {"USA": {2004: 100.0, 2005: 110.0, 2006: 99.0}, "EA20": {2004: 1.0, 2005: 2.0}}

    def build(self, **over):
        args = dict(levels=self.levels, share_levels=self.share, countries={"USA", "DEU"}, years=[2005, 2006])
        return fmd.build_market_data(**{**args, **over})

    def test_merges_the_three_measures_into_country_year_fields(self):
        out = self.build()
        assert out["USA"]["2005"]["bond_yield_pct"] == 4.47
        assert out["USA"]["2005"]["policy_rate_pct"] == 4.16
        assert out["USA"]["2005"]["stock_change_pct"] == pytest.approx(10.0)
        assert out["USA"]["2006"] == {"bond_yield_pct": 4.8, "stock_change_pct": pytest.approx(-10.0)}

    def test_drops_anything_outside_the_roster(self):
        assert set(self.build()) == {"USA"}  # EA20 is not a country; DEU has no data

    def test_a_stock_change_needs_both_this_and_the_previous_december(self):
        out = self.build(share_levels={"USA": {2005: 110.0}})
        assert "stock_change_pct" not in out["USA"]["2005"]

    def test_a_country_with_no_data_is_left_out_not_emptied(self):
        assert "DEU" not in self.build(countries={"DEU"})

    def test_years_outside_the_range_are_ignored_and_output_is_ordered(self):
        out = self.build(levels={"bond_yield_pct": {"USA": {2004: 9.0, 2006: 4.8, 2005: 4.47}}}, share_levels={})
        assert list(out["USA"]) == ["2005", "2006"]

    def test_fields_keep_a_stable_order(self):
        assert list(self.build()["USA"]["2005"]) == ["bond_yield_pct", "policy_rate_pct", "stock_change_pct"]


class TestFetchMeasure:
    def test_asks_for_the_measure_for_all_countries_and_parses_the_csv(self, monkeypatch):
        seen = {}

        def fake_get(url, headers, timeout):
            seen.update(url=url, headers=headers)

            class R:
                text = csv_of(("USA", "2005-12", "4.47"))

                def raise_for_status(self):
                    pass

            return R()

        monkeypatch.setattr(fmd.requests, "get", fake_get)
        assert fmd.fetch_measure("IRLT", [2005, 2006]) == {"USA": {2005: 4.47}}
        assert "/.M.IRLT......" in seen["url"] and "startPeriod=2004-12" in seen["url"] and "endPeriod=2006-12" in seen["url"]
        assert "sdmx.data+csv" in seen["headers"]["Accept"] and "debtrank-globe" in seen["headers"]["User-Agent"]

    def test_gives_up_loudly_after_three_failures(self, monkeypatch):
        calls = []

        def boom(*a, **k):
            calls.append(1)
            raise requests.exceptions.ConnectionError("down")

        monkeypatch.setattr(fmd.requests, "get", boom)
        monkeypatch.setattr(fmd.time, "sleep", lambda s: None)
        with pytest.raises(SystemExit, match="IRLT: giving up"):
            fmd.fetch_measure("IRLT", [2005])
        assert len(calls) == 3


class TestPublishedMarketData:
    """What the web app bundles, checked against the roster it indexes by."""

    data_dir = Path(__file__).resolve().parents[2] / "web" / "src" / "data"

    def test_every_country_is_in_the_roster_and_every_value_is_a_number(self):
        data = json.loads((self.data_dir / "market_data.json").read_text(encoding="utf-8"))
        roster = fmd.roster_ids()
        assert set(data) <= roster
        for country, years in data.items():
            for year, fields in years.items():
                assert 2005 <= int(year) <= 2025
                assert fields and set(fields) <= {"bond_yield_pct", "policy_rate_pct", "stock_change_pct"}, (country, year)
                assert all(isinstance(v, (int, float)) for v in fields.values()), (country, year)

    def test_the_retrieval_date_for_the_credit_line_is_present(self):
        source = json.loads((self.data_dir / "market_data_source.json").read_text(encoding="utf-8"))
        assert len(source["retrieved"]) == 10 and source["retrieved"][4] == "-"
