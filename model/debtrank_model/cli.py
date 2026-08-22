from __future__ import annotations

import argparse
import json
import sys

import numpy as np

from .debtrank import run_debtrank
from .network import ExposureNetwork


def _load_snapshot(path: str) -> ExposureNetwork:
    with open(path, encoding="utf-8") as f:
        snapshot = json.load(f)

    node_ids = [n["id"] for n in snapshot["nodes"]]
    index = {nid: i for i, nid in enumerate(node_ids)}
    n = len(node_ids)

    exposure = np.zeros((n, n))
    gross_footprint = np.zeros(n)
    for edge in snapshot["edges"]:
        i, j = index[edge["creditor"]], index[edge["debtor"]]
        exposure[i, j] += edge["amount"]
        gross_footprint[i] += edge["amount"]
        gross_footprint[j] += edge["amount"]

    # Basel III Pillar 1 minimum capital ratio, used as an equity floor tied
    # to each node's own cross-border banking footprint. Reserves/GDP are the
    # natural loss-absorbing buffer for an ordinary sovereign, but they're
    # meaningless proxies for cross-border financial centres (Isle of Man,
    # Cayman, Luxembourg, Hong Kong SAR, ...): BIS counts every bank resident
    # there, so reported claims/liabilities run to multiples of local GDP,
    # and some report no GDP/reserves to the World Bank at all. Without this
    # floor those nodes fall back to a flat constant against tens of billions
    # in real exposure, saturating the impact matrix at 1 for nearly every
    # edge -- see web/src/lib/network.ts for the mirrored TS implementation
    # and full rationale (BIS Working Papers No. 1035 / BIS Quarterly Review,
    # June 2022, "The outsize role of cross-border financial centres").
    MIN_CAPITAL_RATIO = 0.08

    def _equity(n_: dict, footprint: float) -> float:
        reserves = float(n_["reserves_usd"]) if n_.get("reserves_usd") else 0.0
        gdp_fallback = float(n_["gdp_usd"]) * 0.01 if n_.get("gdp_usd") else 0.0
        footprint_floor = footprint * MIN_CAPITAL_RATIO
        return max(reserves, gdp_fallback, footprint_floor, 1e6)

    equity = np.array(
        [_equity(n_, gross_footprint[i]) for i, n_ in enumerate(snapshot["nodes"])],
        dtype=float,
    )

    return ExposureNetwork(node_ids=node_ids, exposure=exposure, equity=equity)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run a DebtRank shock simulation on a country exposure network snapshot."
    )
    parser.add_argument("snapshot", help="Path to nodes/edges network snapshot JSON")
    parser.add_argument("--shock", action="append", default=[], metavar="COUNTRY=LEVEL",
                         help="Country to shock and its initial distress level, e.g. GRC=1.0")
    args = parser.parse_args(argv)

    if not args.shock:
        parser.error("at least one --shock COUNTRY=LEVEL is required")

    shocked = {}
    for item in args.shock:
        country, level = item.split("=")
        shocked[country] = float(level)

    network = _load_snapshot(args.snapshot)
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
