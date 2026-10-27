"""Fetch three OECD market series for comparison against the model's predicted
contagion: 10-year government bond yields, short-term/interbank rates, and
share-price performance. They come straight from the OECD's own SDMX API
(dataset `DF_FINMARK`, "Financial market"), one request per measure for every
country, with no key. Until 2026-10 they were fetched through FRED, whose terms
prohibit storing what it serves; the OECD's own terms allow reuse with credit
(docs/plans/2026-09-23-automated-data-refresh.md has the reasoning). The two
agree to the published precision: 2,307 of 2,365 overlapping values were
identical and 39 more differ only by the OECD rounding to two decimals; the
other 19 are Iceland's long-term rate (a different series, the OECD's is the
nominal one) and Chile's share prices (a revision).

Measures used (monthly, we keep December values):
  IRLT    -- long-term interest rates: the 10Y government bond yield.
  IRSTCI  -- immediate rates (call money, interbank): the standard OECD proxy
             for national policy rates. Broader coverage than IRLT.
  SHARE   -- share price index (level). We derive a year-over-year % change
             from consecutive December levels, which needs one extra year of
             history (back to 2004) to compute 2005's change.

Coverage differs per measure; a country missing from a measure simply has no
value for it. The euro-area aggregate (EA20) and any other code that is not a
country in the app's roster is dropped.

Output: out/market_data.json (country -> year -> fields, the shape the web app
reads) and out/market_data_source.json (when it was retrieved, for the credit
line the app shows).
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import sys
import time
from pathlib import Path

import requests

OECD_URL = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/.M.{measure}......"
USER_AGENT = "debtrank-globe-pipeline (+https://github.com/lastch1ld/debtrank-globe)"

LEVELS = {"bond_yield_pct": "IRLT", "policy_rate_pct": "IRSTCI"}
STOCK_MEASURE = "SHARE"

YEARS = list(range(2005, 2026))
ROSTER = Path(__file__).resolve().parent.parent / "web" / "src" / "data" / "network_snapshot.json"


def parse_december_values(csv_text: str) -> dict[str, dict[int, float]]:
    """{country: {year: December value}} from the OECD's SDMX-CSV. Blank values
    and every month but December are skipped."""
    out: dict[str, dict[int, float]] = {}
    for row in csv.DictReader(io.StringIO(csv_text)):
        period, value = row["TIME_PERIOD"], row["OBS_VALUE"]
        if not value or not period.endswith("-12"):
            continue
        out.setdefault(row["REF_AREA"], {})[int(period[:4])] = float(value)
    return out


def build_market_data(
    levels: dict[str, dict[str, dict[int, float]]],
    share_levels: dict[str, dict[int, float]],
    countries: set[str],
    years: list[int],
) -> dict[str, dict[str, dict[str, float]]]:
    """Merge the three measures into country -> year -> fields. `levels` is
    keyed by output field name. A country outside `countries` is dropped; a
    stock change needs both this and the previous December."""
    result: dict[str, dict[str, dict[str, float]]] = {}
    for country in sorted(countries):
        per_year: dict[int, dict[str, float]] = {}
        for field, by_country in levels.items():
            for year, value in by_country.get(country, {}).items():
                if year in years:
                    per_year.setdefault(year, {})[field] = value
        share = share_levels.get(country, {})
        for year in years:
            prev, cur = share.get(year - 1), share.get(year)
            if prev and cur:
                per_year.setdefault(year, {})["stock_change_pct"] = (cur / prev - 1) * 100
        if per_year:
            result[country] = {
                str(y): {f: per_year[y][f] for f in ("bond_yield_pct", "policy_rate_pct", "stock_change_pct") if f in per_year[y]}
                for y in sorted(per_year)
            }
    return result


def fetch_measure(measure: str, years: list[int]) -> dict[str, dict[int, float]]:
    url = OECD_URL.format(measure=measure) + f"?startPeriod={years[0] - 1}-12&endPeriod={years[-1]}-12"
    headers = {"Accept": "application/vnd.sdmx.data+csv; charset=utf-8", "User-Agent": USER_AGENT}
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=headers, timeout=120)
            resp.raise_for_status()
            return parse_december_values(resp.text)
        except requests.exceptions.RequestException as exc:
            if attempt == 2:
                raise SystemExit(f"{measure}: giving up after 3 attempts ({exc.__class__.__name__}: {exc})")
            time.sleep(5)
    raise AssertionError("unreachable")


def roster_ids() -> set[str]:
    return {n["id"] for n in json.loads(ROSTER.read_text(encoding="utf-8"))["nodes"]}


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "out" / "market_data.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    levels = {field: fetch_measure(measure, YEARS) for field, measure in LEVELS.items()}
    share_levels = fetch_measure(STOCK_MEASURE, YEARS)
    countries = roster_ids()

    result = build_market_data(levels, share_levels, countries, YEARS)
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    (out_path.parent / "market_data_source.json").write_text(
        json.dumps({"retrieved": dt.date.today().isoformat()}, indent=2) + "\n", encoding="utf-8"
    )
    covered = {f: sum(1 for c in result.values() if any(f in v for v in c.values())) for f in ("bond_yield_pct", "policy_rate_pct", "stock_change_pct")}
    print(f"Covered (of {len(countries)} countries): {covered} -> {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
