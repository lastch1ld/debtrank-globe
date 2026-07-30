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

    def _equity(n_: dict) -> float:
        # Reserves are the natural loss-absorbing buffer for a sovereign; fall
        # back to a small fraction of GDP, then a floor, when reserves are
        # missing so every node still has strictly positive equity.
        if n_.get("reserves_usd"):
            return float(n_["reserves_usd"])
        if n_.get("gdp_usd"):
            return float(n_["gdp_usd"]) * 0.01
        return 1e6

    equity = np.array([_equity(n_) for n_ in snapshot["nodes"]], dtype=float)
    exposure = np.zeros((n, n))
    for edge in snapshot["edges"]:
        i, j = index[edge["creditor"]], index[edge["debtor"]]
        exposure[i, j] += edge["amount"]

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
