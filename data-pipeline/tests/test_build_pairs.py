import json

from build_pairs import build_pairs, serialise


def _write(dir_, year, edges, portfolio=()):
    (dir_ / f"{year}.json").write_text(
        json.dumps({"nodes": [], "edges": list(edges), "portfolio_edges": list(portfolio)})
    )


def _edge(c, d, amount):
    return {"creditor": c, "debtor": d, "amount": amount}


def test_sums_layers_and_keeps_direction(tmp_path):
    _write(tmp_path, 2020, [_edge("GRC", "DEU", 2e9), _edge("DEU", "GRC", 6e9)], [_edge("DEU", "GRC", 4e9)])
    _write(tmp_path, 2021, [_edge("DEU", "GRC", 1e9)])
    out = build_pairs(tmp_path, min_peak_usd=5e9)
    # sorted key "DEU|GRC": ab = DEU's claim on GRC, ba = GRC's claim on DEU
    assert out["first_year"] == 2020
    assert out["pairs"]["DEU|GRC"] == {"ab": [10000, 1000], "ba": [2000, 0]}


def test_a_pair_is_judged_on_its_combined_peak(tmp_path):
    # 3B each way never reaches 5B alone, but 6B combined does.
    _write(tmp_path, 2020, [_edge("A", "B", 3e9), _edge("B", "A", 3e9), _edge("A", "C", 4e9)])
    pairs = build_pairs(tmp_path, min_peak_usd=5e9)["pairs"]
    assert list(pairs) == ["A|B"]


def test_a_pair_missing_in_some_years_is_zero_there(tmp_path):
    _write(tmp_path, 2020, [_edge("A", "B", 6e9)])
    _write(tmp_path, 2021, [])
    assert build_pairs(tmp_path)["pairs"]["A|B"]["ab"] == [6000, 0]


def test_a_snapshot_without_a_portfolio_layer_is_fine(tmp_path):
    (tmp_path / "2020.json").write_text(json.dumps({"nodes": [], "edges": [_edge("A", "B", 6e9)]}))
    assert "A|B" in build_pairs(tmp_path)["pairs"]


def test_output_is_deterministic(tmp_path):
    _write(tmp_path, 2020, [_edge("B", "A", 6e9), _edge("C", "A", 9e9)])
    assert serialise(build_pairs(tmp_path)) == serialise(build_pairs(tmp_path))
