import csv

from fetch_bis import WANTED, _usable_value, extract_edges, extract_edges_by_year

HEADER = [
    "L_REP_CTY",
    "Reporting country",
    "L_CP_COUNTRY",
    "Counterparty country",
    *WANTED.keys(),
    "2022-Q4",
    "2023-Q1",
    "2023-Q2",
    "2023-Q3",
    "2023-Q4",
]


def _row(rep: str, rep_name: str, cp: str, cp_name: str, values: dict[str, str], **overrides: str) -> list[str]:
    """Builds one CSV row matching HEADER, defaulting every WANTED dimension
    to its wanted value (so the row passes the filter unless a test
    deliberately overrides one) and every quarter column to "" (blank/not
    reported) unless given in `values`."""
    row = {
        "L_REP_CTY": rep,
        "Reporting country": rep_name,
        "L_CP_COUNTRY": cp,
        "Counterparty country": cp_name,
        **WANTED,
        "2022-Q4": "",
        "2023-Q1": "",
        "2023-Q2": "",
        "2023-Q3": "",
        "2023-Q4": "",
    }
    row.update(values)
    row.update(overrides)
    return [row[col] for col in HEADER]


def _write_csv(tmp_path, rows: list[list[str]]):
    path = tmp_path / "bis.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        writer.writerows(rows)
    return path


class TestUsableValue:
    def test_numeric_string_parses(self):
        assert _usable_value("123.5") == 123.5

    def test_blank_is_unusable(self):
        assert _usable_value("") is None

    def test_nan_literal_is_unusable(self):
        assert _usable_value("NaN") is None

    def test_negative_revision_artifact_is_unusable(self):
        assert _usable_value("-42") is None

    def test_non_numeric_garbage_is_unusable(self):
        assert _usable_value("n/a") is None


class TestExtractEdges:
    def test_picks_latest_usable_quarter_over_earlier_ones(self, tmp_path):
        row = _row(
            "DE", "Germany", "FR", "France",
            {"2023-Q1": "100", "2023-Q2": "NaN", "2023-Q3": "-50", "2023-Q4": "120"},
        )
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert len(edges) == 1
        assert edges[0]["creditor"] == "DE"
        assert edges[0]["debtor"] == "FR"
        assert edges[0]["period"] == "2023-Q4"
        assert edges[0]["amount"] == 120 * 1_000_000

    def test_falls_back_to_earlier_quarter_when_latest_is_unusable(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q3": "80", "2023-Q4": "NaN"})
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert len(edges) == 1
        assert edges[0]["period"] == "2023-Q3"
        assert edges[0]["amount"] == 80 * 1_000_000

    def test_row_with_no_usable_quarter_produces_no_edge(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "NaN"})
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert edges == []

    def test_row_not_matching_wanted_dimensions_is_excluded(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "100"}, L_MEASURE="F")
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert edges == []

    def test_aggregate_reporting_country_is_excluded(self, tmp_path):
        row = _row("5J", "All countries", "FR", "France", {"2023-Q4": "100"})
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert edges == []

    def test_self_loop_is_excluded(self, tmp_path):
        row = _row("DE", "Germany", "DE", "Germany", {"2023-Q4": "100"})
        edges, _ = extract_edges(_write_csv(tmp_path, [row]))
        assert edges == []

    def test_country_names_collected_regardless_of_wanted_match(self, tmp_path):
        # Country names come from every scanned row, not just ones that pass
        # the WANTED filter, since a country can appear as a name-only
        # reference in rows using different (unwanted) dimension values.
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "100"}, L_MEASURE="F")
        _, names = extract_edges(_write_csv(tmp_path, [row]))
        assert names["DE"] == "Germany"
        assert names["FR"] == "France"


class TestExtractEdgesByYear:
    def test_takes_q4_value_for_requested_year(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "120"})
        by_year = extract_edges_by_year(_write_csv(tmp_path, [row]), [2023])
        assert by_year[2023] == [{"creditor": "DE", "debtor": "FR", "period": "2023-Q4", "amount": 120_000_000}]

    def test_year_without_a_q4_column_is_empty_not_an_error(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "120"})
        by_year = extract_edges_by_year(_write_csv(tmp_path, [row]), [2023, 2030])
        assert by_year[2030] == []

    def test_unusable_q4_cell_yields_no_edge_for_that_year(self, tmp_path):
        row = _row("DE", "Germany", "FR", "France", {"2023-Q4": "NaN"})
        by_year = extract_edges_by_year(_write_csv(tmp_path, [row]), [2023])
        assert by_year[2023] == []
