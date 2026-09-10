"""The invariant this script exists to hold: a partial refresh may change
the numbers on the graph, never the graph's shape."""
from refresh_worldbank import changed_fields, refreshed_nodes


def node(node_id, **fields):
    base = {
        "id": node_id,
        "name": node_id,
        "lat": 1.0,
        "lng": 2.0,
        "gdp_usd": None,
        "reserves_usd": None,
        "external_debt_usd": None,
        "bank_capital_ratio_pct": None,
    }
    base.update(fields)
    return base


def fresh(node_id, years):
    return {"id": node_id, "name": node_id, "lat": 1.0, "lng": 2.0, "years": years}


class TestRefreshedNodes:
    def test_brings_a_stale_value_up_to_date(self):
        existing = [node("AAA", reserves_usd=1.0e10)]
        api = {"AAA": fresh("AAA", {"2020": {"reserves_usd": 2.5e10}})}
        assert refreshed_nodes(existing, api, "2020")[0]["reserves_usd"] == 2.5e10

    def test_carries_the_last_observation_forward_like_the_full_build(self):
        # The World Bank publishes reserves late; a null for the requested
        # year must fall back to the most recent prior report, not to null.
        existing = [node("AAA", reserves_usd=1.0)]
        api = {"AAA": fresh("AAA", {"2019": {"reserves_usd": 9.9e10}, "2020": {"reserves_usd": None}})}
        assert refreshed_nodes(existing, api, "2020")[0]["reserves_usd"] == 9.9e10

    def test_never_adds_a_country_the_edges_cannot_reach(self):
        # Edges come from BIS data this job can't re-derive and refer to
        # nodes by id, so a newly-reported country has nothing pointing at
        # it and must not appear.
        existing = [node("AAA")]
        api = {
            "AAA": fresh("AAA", {"2020": {"gdp_usd": 5.0}}),
            "ZZZ": fresh("ZZZ", {"2020": {"gdp_usd": 7.0}}),
        }
        assert [n["id"] for n in refreshed_nodes(existing, api, "2020")] == ["AAA"]

    def test_never_drops_a_country_the_edges_still_reference(self):
        existing = [node("AAA", gdp_usd=3.0), node("BBB", gdp_usd=4.0)]
        result = refreshed_nodes(existing, {"AAA": fresh("AAA", {"2020": {"gdp_usd": 5.0}})}, "2020")
        assert [n["id"] for n in result] == ["AAA", "BBB"]

    def test_keeps_the_last_published_values_for_a_country_the_api_forgot(self):
        # Emptying it would silently push that country onto the model's
        # crudest equity fallback.
        existing = [node("BBB", gdp_usd=4.0, reserves_usd=8.0)]
        result = refreshed_nodes(existing, {}, "2020")
        assert result[0]["gdp_usd"] == 4.0 and result[0]["reserves_usd"] == 8.0

    def test_leaves_display_fields_alone(self):
        existing = [node("AAA", name="Old Name", lat=10.0, lng=20.0)]
        api = {"AAA": {"id": "AAA", "name": "New Name", "lat": 0.0, "lng": 0.0,
                       "years": {"2020": {"gdp_usd": 5.0}}}}
        result = refreshed_nodes(existing, api, "2020")[0]
        assert (result["name"], result["lat"], result["lng"]) == ("Old Name", 10.0, 20.0)


class TestChangedFields:
    def test_reports_nothing_when_the_api_agrees_with_what_is_published(self):
        existing = [node("AAA", gdp_usd=5.0)]
        api = {"AAA": fresh("AAA", {"2020": {"gdp_usd": 5.0}})}
        assert changed_fields(existing, refreshed_nodes(existing, api, "2020")) == []

    def test_names_the_country_and_field_that_moved(self):
        existing = [node("AAA", gdp_usd=5.0, reserves_usd=1.0)]
        api = {"AAA": fresh("AAA", {"2020": {"gdp_usd": 5.0, "reserves_usd": 2.0}})}
        assert changed_fields(existing, refreshed_nodes(existing, api, "2020")) == [("AAA", "reserves_usd")]
