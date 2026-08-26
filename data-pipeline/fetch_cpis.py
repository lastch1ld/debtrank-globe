"""Fetch bilateral cross-border portfolio investment (bond/equity) holdings
from the IMF's Coordinated Portfolio Investment Survey (CPIS), via DBnomics'
JSON mirror of the IMF SDMX data (https://db.nomics.world/IMF/CPIS) -- no
auth or bulk download needed, unlike BIS's locational banking statistics.

BIS locational banking stats (see fetch_bis.py) only cover bank-to-bank
loans. CPIS covers cross-border bond and equity holdings -- a second,
largely distinct contagion channel (e.g. Greece 2010 spread mainly through
bondholders, not interbank lending).

For each reporting country, one request returns that country's holdings of
portfolio securities issued by every counterparty at once, across every year
DBnomics has for that pair -- so multi-year coverage comes from the same
requests rather than a separate per-year fetch. INDICATOR
I_A_T_T_T_BP6_USD ("Assets, Total Investment, BPM6, US Dollars") is
REF_AREA's claim on COUNTERPART_AREA -- the same creditor->debtor direction
BIS locational banking edges already use.

CPIS is a voluntary survey with far fewer reporters than BIS's, and its
public data currently lags to ~2023 (no 2024/2025 yet) -- both are expected,
not treated as errors; downstream code shows an empty portfolio layer for a
year/country with no data rather than falling back to anything synthetic.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

BASE_URL = "https://api.db.nomics.world/v22/series/IMF/CPIS"
INDICATOR = "I_A_T_T_T_BP6_USD"


def _is_country_code(code: str) -> bool:
    """CPIS mixes real ISO2 country codes into REF_AREA/COUNTERPART_AREA
    alongside aggregate codes like "1A" (international organisations) or
    "1C_031" (world minus significant financial centres) -- aggregates are
    never two plain uppercase letters, so this is enough to tell them apart
    without hardcoding the aggregate list (which DBnomics could add to)."""
    return len(code) == 2 and code.isalpha() and code.isupper()


def fetch_reporter_series(reporter: str, session) -> list[dict]:
    dims = json.dumps({
        "REF_AREA": [reporter],
        "INDICATOR": [INDICATOR],
        "REF_SECTOR": ["T"],
        "COUNTERPART_SECTOR": ["T"],
    })
    resp = session.get(
        BASE_URL,
        params={"dimensions": dims, "limit": 1000, "observations": 1},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("series", {}).get("docs", [])


def edges_from_series(reporter: str, docs: list[dict], years: set[int]) -> dict[int, list[dict]]:
    """Turns one reporter's series docs into {year: [edge, ...]}, skipping
    aggregate counterparts, self-loops, years outside the requested range,
    and null/negative observations (CPIS represents "not reported" as a
    null value in the period/value arrays, not a sentinel string like BIS's
    "NaN" -- there's nothing to parse, just filter it out)."""
    out: dict[int, list[dict]] = {y: [] for y in years}
    for s in docs:
        counterpart = s["dimensions"]["COUNTERPART_AREA"]
        if not _is_country_code(counterpart) or counterpart == reporter:
            continue
        for period, value in zip(s["period"], s["value"]):
            # DBnomics represents confidential/unavailable CPIS observations
            # as the literal string "NA" (distinct from a JSON null), mixed
            # into an otherwise-numeric value array.
            if not isinstance(value, (int, float)) or value < 0:
                continue
            # A handful of early observations are semi-annual ("1997-S2")
            # rather than annual -- CPIS only became a yearly survey later,
            # so these plain-year periods are what we actually want.
            if not period.isdigit():
                continue
            year = int(period)
            if year not in years:
                continue
            out[year].append({"creditor": reporter, "debtor": counterpart, "amount": float(value)})
    return out


def extract_edges_by_year(reporters: list[str], years: list[int], sleep: float = 0.0) -> dict[int, list[dict]]:
    import requests

    year_set = set(years)
    edges_by_year: dict[int, list[dict]] = {y: [] for y in years}

    with requests.Session() as session:
        for i, reporter in enumerate(reporters, 1):
            try:
                docs = fetch_reporter_series(reporter, session)
            except Exception as exc:  # network/HTTP hiccups shouldn't abort the whole run
                print(f"[{i}/{len(reporters)}] {reporter}: FAILED ({exc})", file=sys.stderr)
                continue
            per_year = edges_from_series(reporter, docs, year_set)
            for year, edges in per_year.items():
                edges_by_year[year].extend(edges)
            found = sum(len(v) for v in per_year.values())
            print(f"[{i}/{len(reporters)}] {reporter}: {len(docs)} series, {found} edges", file=sys.stderr)
            if sleep:
                time.sleep(sleep)

    return edges_by_year


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reporters", help="Comma-separated ISO2 reporter codes (default: all known CPIS REF_AREA codes)")
    parser.add_argument("--years", default="2005:2025", metavar="START:END")
    parser.add_argument("--sleep", type=float, default=0.0, help="Delay between requests, seconds")
    parser.add_argument("out", nargs="?", default=None)
    args = parser.parse_args()

    start, end = (int(x) for x in args.years.split(":"))
    years = list(range(start, end + 1))

    if args.reporters:
        reporters = [r.strip().upper() for r in args.reporters.split(",")]
    else:
        import requests

        meta = requests.get("https://api.db.nomics.world/v22/datasets/IMF/CPIS", timeout=30).json()
        ref_area_labels = meta["datasets"]["docs"][0]["dimensions_values_labels"]["REF_AREA"]
        reporters = sorted(code for code in ref_area_labels if _is_country_code(code))

    print(f"Fetching CPIS portfolio-asset edges for {len(reporters)} reporters, years {start}-{end}", file=sys.stderr)
    edges_by_year = extract_edges_by_year(reporters, years, sleep=args.sleep)

    out_path = Path(args.out) if args.out else Path(__file__).parent / "out" / "cpis_edges_by_year.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({str(y): edges for y, edges in edges_by_year.items()}, f)

    for year, edges in edges_by_year.items():
        print(f"  {year}: {len(edges)} edges", file=sys.stderr)
    print(f"Wrote portfolio edges to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
