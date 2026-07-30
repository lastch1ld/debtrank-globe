"""Fetch country node attributes (external debt, reserves, GDP, lat/lng) from
the World Bank Indicators API (no auth required).
"""
from __future__ import annotations

import json
import sys
import time
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


def fetch_indicator_latest(indicator_code: str, year_range: str = "2015:2023") -> dict[str, float]:
    """Return {iso3: most_recent_non_null_value} for the given indicator."""
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


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "out" / "nodes.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    countries = fetch_countries()
    print(f"Fetched {len(countries)} countries", file=sys.stderr)

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
