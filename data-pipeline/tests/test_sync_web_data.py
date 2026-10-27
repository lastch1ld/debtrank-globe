"""sync_web_data must never publish the withdrawn IMF CPIS layer."""
import json

import sync_web_data as sync


def year_file(tmp_path, portfolio):
    path = tmp_path / "by_year" / "2020.json"
    path.parent.mkdir()
    path.write_text(json.dumps({"nodes": [], "edges": [], "portfolio_edges": portfolio}))
    return path


def test_counts_edges_in_the_withdrawn_layer(tmp_path):
    assert sync.withdrawn_layer_in(year_file(tmp_path, [{"creditor": "A", "debtor": "B", "amount": 1}])) == 1


def test_an_empty_or_missing_layer_counts_as_zero(tmp_path):
    assert sync.withdrawn_layer_in(year_file(tmp_path, [])) == 0
    (tmp_path / "old.json").write_text(json.dumps({"nodes": [], "edges": []}))
    assert sync.withdrawn_layer_in(tmp_path / "old.json") == 0


def test_a_year_file_with_the_layer_is_refused_and_not_copied(tmp_path, monkeypatch, capsys):
    out, web = tmp_path / "out", tmp_path / "web"
    (out / "by_year").mkdir(parents=True)
    (out / "by_year" / "2020.json").write_text(json.dumps({"nodes": [], "edges": [], "portfolio_edges": [{"creditor": "A", "debtor": "B", "amount": 1}]}))
    (out / "by_year" / "2021.json").write_text(json.dumps({"nodes": [], "edges": [], "portfolio_edges": []}))
    monkeypatch.setattr(sync, "OUT", out)
    monkeypatch.setattr(sync, "WEB", web)
    monkeypatch.setattr(sync, "SRC_DATA", web / "src" / "data")
    monkeypatch.setattr(sync, "PUBLIC_DATA", web / "public" / "data" / "network")
    monkeypatch.setattr(sync.sys, "argv", ["sync_web_data.py"])

    assert sync.main() == 1
    assert not (web / "public" / "data" / "network" / "2020.json").exists()
    assert "refused" in capsys.readouterr().out
