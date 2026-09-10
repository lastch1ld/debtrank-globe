from __future__ import annotations

import argparse
import json
import sys

from .debtrank import run_debtrank
from .network import build_exposure_network


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run a DebtRank shock simulation on a country exposure network snapshot."
    )
    parser.add_argument("snapshot", help="Path to nodes/edges network snapshot JSON")
    parser.add_argument("--shock", action="append", default=[], metavar="COUNTRY=LEVEL",
                         help="Country to shock and its initial distress level, e.g. GRC=1.0. "
                              "Repeat to shock several countries at once.")
    parser.add_argument("--include-portfolio", action="store_true",
                         help="Add the IMF CPIS bond/equity layer to the BIS banking edges "
                              "(matches the web app's 'Include portfolio investment' toggle). "
                              "CPIS coverage ends at 2023.")
    args = parser.parse_args(argv)

    if not args.shock:
        parser.error("at least one --shock COUNTRY=LEVEL is required")

    shocked = {}
    for item in args.shock:
        country, level = item.split("=")
        shocked[country] = float(level)

    with open(args.snapshot, encoding="utf-8") as f:
        snapshot = json.load(f)
    network = build_exposure_network(snapshot, include_portfolio=args.include_portfolio)
    result = run_debtrank(network, shocked)

    print(f"Aggregate DebtRank impact: {result.debtrank:.4f}")
    print("Final distress by country:")
    for node_id, distress in sorted(
        zip(result.node_ids, result.final_distress), key=lambda x: -x[1]
    ):
        if distress > 1e-9:
            print(f"  {node_id}: {distress:.4f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
