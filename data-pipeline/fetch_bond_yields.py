"""Fetch 10-year government bond yield equivalents (FRED's OECD "long-term
interest rate" series) for market-check comparison against the model's
predicted contagion.

Unlike the World Bank/BIS APIs, FRED's graph CSV export needs no API key:
https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01{iso2}M156N

Coverage is OECD-centric -- a 404 means that country isn't published under
this series at all (confirmed for e.g. Brazil, India, China), which is
treated as "no data" rather than an error.
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
from pathlib import Path

import requests

from fetch_worldbank import fetch_countries

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01{iso2}M156N"


def fetch_yearend_yields(iso2: str, years: list[int]) -> dict[int, float]:
    """Return {year: december_value} for a country's FRED series, or {} if
    that country isn't covered by this series (HTTP 404)."""
    resp = requests.get(FRED_CSV_URL.format(iso2=iso2), timeout=20)
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()

    by_year: dict[int, float] = {}
    reader = csv.reader(io.StringIO(resp.text))
    next(reader)  # header
    wanted_years = set(years)
    for row in reader:
        if len(row) != 2:
            continue
        date, value = row
        if not date.endswith("-12-01"):
            continue
        year = int(date[:4])
        if year not in wanted_years or not value or value == ".":
            continue
        by_year[year] = float(value)
    return by_year


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "out" / "bond_yields.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    years = list(range(2005, 2026))

    countries = fetch_countries()
    result: dict[str, dict[str, float]] = {}
    covered = 0
    for c in countries:
        iso2 = c["iso2Code"]
        if not iso2:
            continue
        for attempt in range(3):
            try:
                by_year = fetch_yearend_yields(iso2, years)
                break
            except requests.exceptions.RequestException as exc:
                if attempt == 2:
                    print(f"  {c['id']}: giving up after retries ({exc.__class__.__name__})", file=sys.stderr)
                    by_year = {}
                    break
                time.sleep(2)
        if by_year:
            covered += 1
            result[c["id"]] = {str(y): v for y, v in by_year.items()}
        time.sleep(0.1)

    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Covered {covered}/{len(countries)} countries -> {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
