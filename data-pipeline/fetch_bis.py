"""Fetch bilateral cross-border bank exposures from BIS Locational Banking
Statistics (LBS) and normalize into creditor->debtor edges.

BIS does not expose a simple per-pair SDMX query for this in a way that's
practical to page through, so this uses the official bulk CSV download
(https://data.bis.org/static/bulk/WS_LBS_D_PUB_csv_col.zip, ~120MB zipped,
~530MB unzipped) and streams+filters it rather than loading it fully into
memory.

Filters applied (see BIS LBS dimension guide):
  L_MEASURE   = S   (Amounts outstanding / stocks)
  L_POSITION  = C   (Total claims -- i.e. reporting country's banks' claims
                      on the counterparty country: this is the "creditor
                      is exposed to debtor" direction we want)
  L_INSTR     = A   (All instruments)
  L_DENOM     = TO1 (All currencies)
  L_CURR_TYPE = A   (All currencies of reporting country)
  L_PARENT_CTY= 5J  (All countries -- not split by parent bank nationality)
  L_REP_BANK_TYPE = A (All reporting banks)
  L_CP_SECTOR = A   (All counterparty sectors)
  L_POS_TYPE  = N   (Cross-border)
  ORG_VISIBILITY = E (Public)

For each (reporting country, counterparty country) pair, the most recent
non-null quarterly value is taken as that edge's exposure amount (BIS
reports these in millions of USD; we convert to USD).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import zipfile
from pathlib import Path

BULK_URL = "https://data.bis.org/static/bulk/WS_LBS_D_PUB_csv_col.zip"

WANTED = {
    "L_MEASURE": "S",
    "L_POSITION": "C",
    "L_INSTR": "A",
    "L_DENOM": "TO1",
    "L_CURR_TYPE": "A",
    "L_PARENT_CTY": "5J",
    "L_REP_BANK_TYPE": "A",
    "L_CP_SECTOR": "A",
    "L_POS_TYPE": "N",
    "ORG_VISIBILITY": "E",
}

# Non-country aggregate codes that occasionally show up as reporting/counterparty
# "countries" in BIS data (regional/"all countries" aggregates) -- excluded since
# our network only wants real bilateral country-country edges.
AGGREGATE_CODES = {"5J", "1C", "1D", "2B", "2C", "2H", "2J", "2R", "2S", "2T", "2U", "3A", "3B", "3C", "3P", "4T", "5R", "6R"}


def _open_csv(path: Path):
    if path.suffix == ".zip":
        zf = zipfile.ZipFile(path)
        name = next(n for n in zf.namelist() if n.endswith(".csv"))
        return zf.open(name), zf
    return open(path, encoding="utf-8"), None


def download_bulk_csv(dest: Path) -> None:
    import requests

    print(f"Downloading {BULK_URL} -> {dest} (this is ~120MB)", file=sys.stderr)
    with requests.get(BULK_URL, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)


def extract_edges(csv_path: Path) -> list[dict]:
    raw, zf = _open_csv(csv_path)
    text = raw if isinstance(raw, type(sys.stdin)) else __import__("io").TextIOWrapper(raw, encoding="utf-8")

    reader = csv.reader(text)
    header = next(reader)
    idx = {name: i for i, name in enumerate(header)}
    time_cols = [i for i, name in enumerate(header) if "-Q" in name]
    time_names = [header[i] for i in time_cols]

    edges: dict[tuple[str, str], tuple[str, float]] = {}
    country_names: dict[str, str] = {}
    rows_scanned = 0
    rows_matched = 0

    for row in reader:
        rows_scanned += 1
        country_names.setdefault(row[idx["L_REP_CTY"]], row[idx["Reporting country"]])
        country_names.setdefault(row[idx["L_CP_COUNTRY"]], row[idx["Counterparty country"]])
        if not all(row[idx[k]] == v for k, v in WANTED.items()):
            continue

        rep = row[idx["L_REP_CTY"]]
        cp = row[idx["L_CP_COUNTRY"]]
        if rep in AGGREGATE_CODES or cp in AGGREGATE_CODES or rep == cp:
            continue
        if len(rep) != 2 or len(cp) != 2:
            continue

        # find the most recent quarterly value that's an actual usable number.
        # BIS marks confidential/missing cells as the literal string "NaN" in
        # this bulk export, and a handful of cells are negative due to data
        # revisions/netting -- neither represents a real positive exposure.
        latest_period = None
        latest_value = None
        for i, period in zip(time_cols, time_names):
            val = row[i]
            if not val:
                continue
            try:
                num = float(val)
            except ValueError:
                continue
            if not (num == num) or num < 0:  # NaN check without importing math
                continue
            latest_period, latest_value = period, num

        if latest_value is None:
            continue

        rows_matched += 1
        key = (rep, cp)
        if key not in edges or latest_period > edges[key][0]:
            edges[key] = (latest_period, float(latest_value))

    if zf:
        zf.close()

    print(f"Scanned {rows_scanned} rows, matched {rows_matched}, {len(edges)} unique country pairs",
          file=sys.stderr)

    edge_list = [
        {
            "creditor": rep,
            "debtor": cp,
            "period": period,
            "amount": value * 1_000_000,  # BIS reports in millions USD
        }
        for (rep, cp), (period, value) in edges.items()
    ]
    return edge_list, country_names


def extract_edges_by_year(csv_path: Path, years: list[int]) -> dict[int, list[dict]]:
    """Single pass over the bulk CSV, taking each requested year's Q4 value
    specifically (a consistent "year-end snapshot" convention) rather than
    whatever the most recent reported quarter happens to be. One pass over
    the ~600k-row file regardless of how many years are requested."""
    raw, zf = _open_csv(csv_path)
    text = raw if isinstance(raw, type(sys.stdin)) else __import__("io").TextIOWrapper(raw, encoding="utf-8")

    reader = csv.reader(text)
    header = next(reader)
    idx = {name: i for i, name in enumerate(header)}
    year_col = {year: idx.get(f"{year}-Q4") for year in years}

    edges_by_year: dict[int, dict[tuple[str, str], float]] = {year: {} for year in years}
    rows_scanned = 0

    for row in reader:
        rows_scanned += 1
        if not all(row[idx[k]] == v for k, v in WANTED.items()):
            continue

        rep = row[idx["L_REP_CTY"]]
        cp = row[idx["L_CP_COUNTRY"]]
        if rep in AGGREGATE_CODES or cp in AGGREGATE_CODES or rep == cp:
            continue
        if len(rep) != 2 or len(cp) != 2:
            continue

        for year, col in year_col.items():
            if col is None:
                continue
            val = row[col]
            if not val:
                continue
            try:
                num = float(val)
            except ValueError:
                continue
            if not (num == num) or num < 0:  # NaN / negative-revision check
                continue
            edges_by_year[year][(rep, cp)] = num

    if zf:
        zf.close()

    print(f"Scanned {rows_scanned} rows across {len(years)} years", file=sys.stderr)

    return {
        year: [
            {"creditor": rep, "debtor": cp, "period": f"{year}-Q4", "amount": value * 1_000_000}
            for (rep, cp), value in pairs.items()
        ]
        for year, pairs in edges_by_year.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("out", nargs="?", default=None)
    parser.add_argument(
        "--by-year",
        metavar="START:END",
        help="Extract one Q4 snapshot per year in this range instead of the single "
        "latest value (writes out/edges_by_year.json instead of out/edges.json)",
    )
    args = parser.parse_args()
    csv_path = Path(args.csv_path)

    if args.by_year:
        start, end = (int(x) for x in args.by_year.split(":"))
        out_path = Path(args.out) if args.out else Path(__file__).parent / "out" / "edges_by_year.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)

        edges_by_year = extract_edges_by_year(csv_path, list(range(start, end + 1)))
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({str(y): edges for y, edges in edges_by_year.items()}, f)

        for year, edges in edges_by_year.items():
            print(f"  {year}: {len(edges)} edges", file=sys.stderr)
        print(f"Wrote multi-year edges to {out_path}", file=sys.stderr)
        return

    out_path = Path(args.out) if args.out else Path(__file__).parent / "out" / "edges.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    edges, country_names = extract_edges(csv_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"edges": edges}, f, indent=2)

    names_path = out_path.parent / "bis_country_codes.json"
    with open(names_path, "w", encoding="utf-8") as f:
        json.dump(country_names, f, indent=2, sort_keys=True)

    print(f"Wrote {len(edges)} edges to {out_path}", file=sys.stderr)
    print(f"Wrote {len(country_names)} BIS country codes to {names_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
