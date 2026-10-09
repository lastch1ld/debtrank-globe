#!/usr/bin/env python3
"""Builds web/public/data/network/pairs.json: a small per-pair history index.

The pair view draws a 2005-2025 sparkline of A's claim on B and B's claim on
A. Getting that from the per-year files would mean fetching all 21 of them
(~11 MB), so this derives one compact file from them instead. It reads the
published year files, so it needs no BIS or CPIS download and can be re-run
after any regeneration or refresh.

Only pairs whose combined exposure ever reached MIN_PEAK_USD are indexed;
smaller pairs would add hundreds of KB for lines nobody can see. The pair
view shows "no history indexed" for those.

Schema (additive, see docs/data-api.md):
    {"first_year": 2005, "unit": "usd_millions", "min_peak_usd": 5e9,
     "pairs": {"DEU|GRC": {"ab": [..21 values..], "ba": [..21 values..]}}}
Keys are the two ISO3 ids sorted; "ab" is the sorted-first country's claim on
the second, "ba" the reverse. Banking and portfolio layers are summed.

Usage:  python build_pairs.py [--check]
    --check  Exit non-zero if the file on disk differs from a rebuild.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "network"
MIN_PEAK_USD = 5e9
LAYERS = ("edges", "portfolio_edges")


def build_pairs(data_dir: Path = DATA_DIR, min_peak_usd: float = MIN_PEAK_USD) -> dict:
    files = sorted(data_dir.glob("[0-9][0-9][0-9][0-9].json"))
    if not files:
        raise SystemExit(f"no year files in {data_dir}")
    years = [int(f.stem) for f in files]
    if years != list(range(years[0], years[0] + len(years))):
        raise SystemExit(f"year files are not consecutive: {years}")

    # directed[(creditor, debtor)][year index] -> USD
    directed: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0] * len(years))
    for i, f in enumerate(files):
        snapshot = json.loads(f.read_text(encoding="utf-8"))
        for layer in LAYERS:
            for e in snapshot.get(layer, []):
                directed[(e["creditor"], e["debtor"])][i] += e["amount"]

    zeros = [0.0] * len(years)
    pairs = {}
    for a, b in sorted({tuple(sorted(k)) for k in directed}):
        ab = directed.get((a, b), zeros)
        ba = directed.get((b, a), zeros)
        if max(x + y for x, y in zip(ab, ba)) < min_peak_usd:
            continue
        pairs[f"{a}|{b}"] = {
            "ab": [round(v / 1e6) for v in ab],
            "ba": [round(v / 1e6) for v in ba],
        }
    return {"first_year": years[0], "unit": "usd_millions", "min_peak_usd": min_peak_usd, "pairs": pairs}


def serialise(index: dict) -> str:
    return json.dumps(index, separators=(",", ":")) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = DATA_DIR / "pairs.json"
    text = serialise(build_pairs())
    if args.check:
        if not out.exists() or out.read_text(encoding="utf-8") != text:
            print(f"{out} is stale: run python build_pairs.py")
            return 1
        return 0
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {out} ({len(text) / 1e3:.0f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
