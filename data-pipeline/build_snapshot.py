"""Merge World Bank node attributes and BIS bilateral edges into a single
network snapshot (ISO3-keyed) that model/ and web/ both consume.

BIS edges are keyed by ISO2 country code; World Bank nodes are keyed by
ISO3. This joins them via the World Bank country list's iso2Code field,
dropping any edge where either side isn't a real country in our node set
(this is what naturally filters out BIS's aggregate/regional codes like
"5J" All countries, "2B" Unallocated emerging Europe, etc, without needing
to hardcode every aggregate code).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _fetch_iso2_to_iso3() -> dict[str, str]:
    import requests

    resp = requests.get(
        "https://api.worldbank.org/v2/country",
        params={"format": "json", "per_page": 400},
        timeout=30,
    )
    resp.raise_for_status()
    _, countries = resp.json()
    return {c["iso2Code"]: c["id"] for c in countries if c["region"]["id"] != "NA"}


FILL_FIELDS = ("gdp_usd", "reserves_usd", "external_debt_usd", "bank_capital_ratio_pct")
MAX_CARRY_FORWARD_YEARS = 3


def _last_observation_carried_forward(node: dict, year_str: str) -> dict:
    """World Bank annual indicators (GDP, reserves, external debt) are
    published with a lag -- a country's most recent 1-2 years are routinely
    still null at fetch time even though the underlying data exists and
    will show up later. Querying each year independently (as
    fetch_indicator_by_year does) takes that lag at face value, which
    silently pushes ~40 countries (including real economies like Hong Kong
    SAR, not just data-void micro-jurisdictions) onto the model's crude
    reserves/GDP fallback for the most recent year -- exactly the year the
    app defaults to.

    Standard fix for this in longitudinal panels: last observation carried
    forward (LOCF). If a field is null for `year_str`, use the most recent
    prior year's value instead, capped at MAX_CARRY_FORWARD_YEARS so we
    don't freeze a genuinely stale (e.g. discontinued-reporting) figure in
    forever -- past that cap we fall through to null and let the model's
    own equity fallback (see web/src/lib/network.ts equityFor) take over.
    """
    year = int(year_str)
    year_values = dict(node["years"].get(year_str, {}))
    for field in FILL_FIELDS:
        if year_values.get(field) is not None:
            continue
        for back in range(1, MAX_CARRY_FORWARD_YEARS + 1):
            prior = node["years"].get(str(year - back))
            if prior and prior.get(field) is not None:
                year_values[field] = prior[field]
                break
    return year_values


def build_by_year(nodes_by_year_path: Path, edges_by_year_path: Path, out_dir: Path) -> None:
    """One merged snapshot per year, for the historical scrubber. Written as
    out_dir/{year}.json, each with the same {"nodes": [...], "edges": [...]}
    shape as the single-year network_snapshot.json, so the web app's loader
    doesn't need to know the difference."""
    nodes_by_year = json.loads(nodes_by_year_path.read_text(encoding="utf-8"))["nodes"]
    edges_by_year = json.loads(edges_by_year_path.read_text(encoding="utf-8"))

    iso2_to_iso3 = _fetch_iso2_to_iso3()
    out_dir.mkdir(parents=True, exist_ok=True)

    for year_str, edges_raw in edges_by_year.items():
        year = int(year_str)

        nodes = []
        for n in nodes_by_year:
            year_values = _last_observation_carried_forward(n, year_str)
            nodes.append({
                "id": n["id"],
                "name": n["name"],
                "lat": n["lat"],
                "lng": n["lng"],
                "gdp_usd": year_values.get("gdp_usd"),
                "reserves_usd": year_values.get("reserves_usd"),
                "external_debt_usd": year_values.get("external_debt_usd"),
                "bank_capital_ratio_pct": year_values.get("bank_capital_ratio_pct"),
            })
        iso3_with_node = {n["id"] for n in nodes}

        edges = []
        for e in edges_raw:
            creditor_iso3 = iso2_to_iso3.get(e["creditor"])
            debtor_iso3 = iso2_to_iso3.get(e["debtor"])
            if not creditor_iso3 or not debtor_iso3:
                continue
            if creditor_iso3 not in iso3_with_node or debtor_iso3 not in iso3_with_node:
                continue
            edges.append({
                "creditor": creditor_iso3,
                "debtor": debtor_iso3,
                "period": e["period"],
                "amount": e["amount"],
            })

        out_path = out_dir / f"{year}.json"
        out_path.write_text(json.dumps({"nodes": nodes, "edges": edges}, separators=(",", ":")), encoding="utf-8")
        print(f"{year}: {len(nodes)} nodes, {len(edges)} edges -> {out_path}", file=sys.stderr)


def main() -> None:
    by_year_parser = argparse.ArgumentParser(add_help=False)
    by_year_parser.add_argument("--by-year", action="store_true")
    known, _ = by_year_parser.parse_known_args()

    if known.by_year:
        parser = argparse.ArgumentParser()
        parser.add_argument("--by-year", action="store_true")
        parser.add_argument("nodes_by_year", nargs="?", default=None)
        parser.add_argument("edges_by_year", nargs="?", default=None)
        parser.add_argument("out_dir", nargs="?", default=None)
        args = parser.parse_args()
        base = Path(__file__).parent / "out"
        build_by_year(
            Path(args.nodes_by_year) if args.nodes_by_year else base / "nodes_by_year.json",
            Path(args.edges_by_year) if args.edges_by_year else base / "edges_by_year.json",
            Path(args.out_dir) if args.out_dir else base / "by_year",
        )
        return

    _main_single_year()


def _main_single_year() -> None:
    base = Path(__file__).parent / "out"
    nodes_path = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "nodes.json"
    edges_path = Path(sys.argv[2]) if len(sys.argv) > 2 else base / "edges.json"
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else base / "network_snapshot.json"

    nodes = json.loads(nodes_path.read_text(encoding="utf-8"))["nodes"]
    edges_raw = json.loads(edges_path.read_text(encoding="utf-8"))["edges"]

    iso2_to_iso3 = _fetch_iso2_to_iso3()
    iso3_with_node = {n["id"] for n in nodes}

    edges = []
    dropped = 0
    for e in edges_raw:
        creditor_iso3 = iso2_to_iso3.get(e["creditor"])
        debtor_iso3 = iso2_to_iso3.get(e["debtor"])
        if not creditor_iso3 or not debtor_iso3:
            dropped += 1
            continue
        if creditor_iso3 not in iso3_with_node or debtor_iso3 not in iso3_with_node:
            dropped += 1
            continue
        edges.append({
            "creditor": creditor_iso3,
            "debtor": debtor_iso3,
            "period": e["period"],
            "amount": e["amount"],
        })

    snapshot = {"nodes": nodes, "edges": edges}
    out_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"{len(edges)} edges kept, {dropped} dropped (aggregates/unmapped) -> {out_path}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
