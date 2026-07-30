"""Fetch three FRED market series for comparison against the model's
predicted contagion: 10-year government bond yields, short-term/policy
interest rates, and stock index performance.

Unlike the World Bank/BIS APIs, FRED's graph CSV export needs no API key:
https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}{iso2}{suffix}

Coverage differs per series (all OECD-published, but with different country
lists) -- a 404 means that country isn't published under that specific
series, treated as "no data" for that series rather than an error. A country
can have some series covered and not others.

Series used:
  IRLTLT01{iso2}M156N -- 10Y government bond yield equivalent.
  IRSTCI01{iso2}M156N -- short-term/interbank rate, the standard OECD proxy
                          for national policy rates. Broader coverage than
                          the bond series (confirmed for e.g. Brazil, South
                          Africa, Mexico, which the bond series does not
                          cover).
  SPASTT01{iso2}M661N -- share price index (level). We derive a year-over-
                          year %% change from consecutive December levels,
                          which needs one extra year of history (back to
                          2004) to compute 2005's change.
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

SERIES = {
    "bond_yield_pct": "IRLTLT01{iso2}M156N",
    "policy_rate_pct": "IRSTCI01{iso2}M156N",
}
STOCK_INDEX_SERIES = "SPASTT01{iso2}M661N"

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def fetch_yearend_series(series_id: str, years: list[int]) -> dict[int, float]:
    """Return {year: december_value} for a FRED series, or {} if not
    covered (HTTP 404)."""
    resp = requests.get(FRED_CSV_URL.format(series_id=series_id), timeout=20)
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


def fetch_with_retries(series_id: str, years: list[int], label: str) -> dict[int, float]:
    for attempt in range(3):
        try:
            return fetch_yearend_series(series_id, years)
        except requests.exceptions.RequestException as exc:
            if attempt == 2:
                print(f"  {label}: giving up after retries ({exc.__class__.__name__})", file=sys.stderr)
                return {}
            time.sleep(2)
    return {}


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "out" / "market_data.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    years = list(range(2005, 2026))

    countries = fetch_countries()
    result: dict[str, dict[str, dict[str, float]]] = {}
    covered_counts = dict.fromkeys(SERIES, 0)
    covered_counts["stock_change_pct"] = 0

    for c in countries:
        iso2 = c["iso2Code"]
        if not iso2:
            continue

        per_year: dict[int, dict[str, float]] = {}

        for field, template in SERIES.items():
            by_year = fetch_with_retries(template.format(iso2=iso2), years, f"{c['id']}/{field}")
            if by_year:
                covered_counts[field] += 1
                for year, value in by_year.items():
                    per_year.setdefault(year, {})[field] = value
            time.sleep(0.1)

        stock_levels = fetch_with_retries(
            STOCK_INDEX_SERIES.format(iso2=iso2), [2004] + years, f"{c['id']}/stock_index"
        )
        if stock_levels:
            had_change = False
            for year in years:
                prev, cur = stock_levels.get(year - 1), stock_levels.get(year)
                if prev and cur:
                    per_year.setdefault(year, {})["stock_change_pct"] = (cur / prev - 1) * 100
                    had_change = True
            if had_change:
                covered_counts["stock_change_pct"] += 1
        time.sleep(0.1)

        if per_year:
            result[c["id"]] = {str(y): v for y, v in per_year.items()}

    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Covered (of {len(countries)} countries): {covered_counts} -> {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
