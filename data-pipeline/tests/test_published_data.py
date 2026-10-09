"""Checks on the published per-year files in web/public/data/network/ -- the
data API the app (and anyone embedding it) reads -- rather than on the code
that builds them. They fail when a regeneration or refresh quietly changes
what is served."""
import json
from pathlib import Path

import pytest

DATA_DIR = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "network"
YEAR_FILES = sorted(DATA_DIR.glob("[0-9][0-9][0-9][0-9].json"))
LAYERS = ("edges", "portfolio_edges")


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_year_files_are_present():
    assert YEAR_FILES, f"no year files found in {DATA_DIR}"


@pytest.mark.parametrize("path", YEAR_FILES, ids=lambda p: p.stem)
class TestYearFile:
    def test_edges_reference_existing_nodes(self, path):
        data = _load(path)
        ids = {n["id"] for n in data["nodes"]}
        for layer in LAYERS:
            for e in data.get(layer, []):
                assert e["creditor"] in ids and e["debtor"] in ids, (layer, e)

    def test_amounts_are_positive(self, path):
        data = _load(path)
        for layer in LAYERS:
            for e in data.get(layer, []):
                assert e["amount"] > 0, (layer, e)

    def test_no_duplicate_or_self_pairs(self, path):
        data = _load(path)
        for layer in LAYERS:
            pairs = [(e["creditor"], e["debtor"]) for e in data.get(layer, [])]
            assert len(pairs) == len(set(pairs)), f"duplicate pair in {layer}"
            assert all(c != d for c, d in pairs), f"self edge in {layer}"


def test_node_ids_are_the_same_in_every_year():
    ids_by_year = {p.stem: {n["id"] for n in _load(p)["nodes"]} for p in YEAR_FILES}
    reference = next(iter(ids_by_year.values()))
    assert all(ids == reference for ids in ids_by_year.values()), {
        year: len(ids) for year, ids in ids_by_year.items()
    }
