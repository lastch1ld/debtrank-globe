"""Fetch country node attributes (external debt, reserves, GDP, lat/lng) from
the World Bank Indicators API (no auth required).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

import requests

WB_BASE = "https://api.worldbank.org/v2"

INDICATORS = {
    "external_debt_usd": "DT.DOD.DECT.CD",
    "reserves_usd": "FI.RES.TOTL.CD",
    "gdp_usd": "NY.GDP.MKTP.CD",
}


def fetch_countries() -> list[dict]:
    resp = requests.get(f"{WB_BASE}/country", params={"format": "json", "per_page": 400}, timeout=30)
    resp.raise_for_status()
    _, countries = resp.json()
    # Aggregates (regions, income groups) have region.id == "NA"; keep only real countries.
    return [c for c in countries if c["region"]["id"] != "NA"]


# Upper bound is derived from today's date rather than hardcoded: a fixed
# end year (e.g. "2015:2023") quietly goes stale every year this pipeline
# is re-run, capping every country's "latest" GDP/reserves/external-debt
# figure at whatever year the constant was written in even once newer data
# exists. fetch_indicator_latest already picks the most recent non-null
# value within the range, so widening the range costs nothing.
def _default_year_range() -> str:
    return f"2015:{date.today().year}"


def fetch_indicator_latest(indicator_code: str, year_range: str | None = None) -> dict[str, float]:
    """Return {iso3: most_recent_non_null_value} for the given indicator."""
    if year_range is None:
        year_range = _default_year_range()
    values: dict[str, tuple[str, float]] = {}
    page = 1
    while True:
        resp = requests.get(
            f"{WB_BASE}/country/all/indicator/{indicator_code}",
            params={"format": "json", "per_page": 1000, "date": year_range, "page": page},
            timeout=30,
        )
        resp.raise_for_status()
        meta, rows = resp.json()
        if not rows:
            break
        for row in rows:
            if row["value"] is None:
                continue
            iso3 = row["countryiso3code"]
            date = row["date"]
            if not iso3:
                continue
            if iso3 not in values or date > values[iso3][0]:
                values[iso3] = (date, row["value"])
        if page >= meta["pages"]:
            break
        page += 1
        time.sleep(0.2)
    return {iso3: val for iso3, (_, val) in values.items()}


def fetch_indicator_by_year(indicator_code: str, year_range: str) -> dict[str, dict[str, float]]:
    """Return {iso3: {year: value}} for the given indicator, keeping every
    year in range rather than collapsing to the latest (used for the
    historical year-scrubber snapshots).

    Queried one year at a time rather than as a single wide date range --
    a single ~217-country/1-year request comes back in well under a second,
    whereas a 20-year combined range query was observed to reliably time
    out server-side."""
    start, end = (int(x) for x in year_range.split(":"))
    values: dict[str, dict[str, float]] = {}
    for year in range(start, end + 1):
        # The API's response time for this endpoint is highly variable in
        # practice (observed anywhere from ~0.1s to 45s+ for an identical
        # query) -- retry generously with backoff rather than treat a slow
        # response as a hard failure.
        for attempt in range(5):
            try:
                resp = requests.get(
                    f"{WB_BASE}/country/all/indicator/{indicator_code}",
                    params={"format": "json", "per_page": 400, "date": str(year)},
                    timeout=45,
                )
                resp.raise_for_status()
                break
            except requests.exceptions.RequestException as exc:
                if attempt == 4:
                    raise
                print(f"  {indicator_code} {year}: retrying after {exc.__class__.__name__}", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
        _, rows = resp.json()
        for row in rows or []:
            if row["value"] is None:
                continue
            iso3 = row["countryiso3code"]
            if not iso3:
                continue
            values.setdefault(iso3, {})[row["date"]] = row["value"]
        time.sleep(0.15)
    return values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("out", nargs="?", default=None)
    parser.add_argument(
        "--by-year",
        metavar="START:END",
        help="Fetch a value per year in this range instead of the single latest value "
        "(writes out/nodes_by_year.json instead of out/nodes.json)",
    )
    args = parser.parse_args()

    countries = fetch_countries()
    print(f"Fetched {len(countries)} countries", file=sys.stderr)

    if args.by_year:
        out_path = Path(args.out) if args.out else Path(__file__).parent / "out" / "nodes_by_year.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)

        indicator_by_year = {}
        for field, code in INDICATORS.items():
            print(f"Fetching {field} ({code}) for {args.by_year}...", file=sys.stderr)
            indicator_by_year[field] = fetch_indicator_by_year(code, args.by_year)

        nodes = []
        for c in countries:
            iso3 = c["id"]
            years = set()
            for field_values in indicator_by_year.values():
                years.update(field_values.get(iso3, {}).keys())
            nodes.append({
                "id": iso3,
                "name": c["name"],
                "lat": float(c["latitude"]) if c["latitude"] else None,
                "lng": float(c["longitude"]) if c["longitude"] else None,
                "years": {
                    year: {
                        field: indicator_by_year[field].get(iso3, {}).get(year)
                        for field in INDICATORS
                    }
                    for year in sorted(years)
                },
            })

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"nodes": nodes}, f, indent=2)
        print(f"Wrote {len(nodes)} nodes (multi-year) to {out_path}", file=sys.stderr)
        return

    out_path = Path(args.out) if args.out else Path(__file__).parent / "out" / "nodes.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    indicator_values = {}
    for field, code in INDICATORS.items():
        print(f"Fetching {field} ({code})...", file=sys.stderr)
        indicator_values[field] = fetch_indicator_latest(code)

    nodes = []
    for c in countries:
        iso3 = c["id"]
        node = {
            "id": iso3,
            "name": c["name"],
            "lat": float(c["latitude"]) if c["latitude"] else None,
            "lng": float(c["longitude"]) if c["longitude"] else None,
            "gdp_usd": indicator_values["gdp_usd"].get(iso3),
            "reserves_usd": indicator_values["reserves_usd"].get(iso3),
            "external_debt_usd": indicator_values["external_debt_usd"].get(iso3),
        }
        nodes.append(node)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"nodes": nodes}, f, indent=2)

    have_reserves = sum(1 for n in nodes if n["reserves_usd"])
    print(f"Wrote {len(nodes)} nodes to {out_path} ({have_reserves} with reserves data)", file=sys.stderr)


if __name__ == "__main__":
    main()
