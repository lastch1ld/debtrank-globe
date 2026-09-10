from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class ExposureNetwork:
    """A cross-border debt exposure network.

    node_ids: labels for each node (e.g. ISO country codes), length n.
    exposure: W[i, j] = economic value of node i's exposure to node j
        (i.e. i is the creditor/holder of an asset issued by j; if j
        defaults fully, i stands to lose W[i, j]).
    equity: E[i] = node i's loss-absorbing buffer (e.g. reserves + capital)
        used to scale how much a given exposure loss actually hurts i.
    """

    node_ids: list[str]
    exposure: np.ndarray
    equity: np.ndarray

    def __post_init__(self) -> None:
        n = len(self.node_ids)
        if self.exposure.shape != (n, n):
            raise ValueError(f"exposure must be {n}x{n}, got {self.exposure.shape}")
        if self.equity.shape != (n,):
            raise ValueError(f"equity must have shape ({n},), got {self.equity.shape}")
        if np.any(self.equity <= 0):
            raise ValueError("equity must be strictly positive for every node")

    @property
    def n(self) -> int:
        return len(self.node_ids)

    def impact_matrix(self) -> np.ndarray:
        """A[i, j] = fraction of i's equity wiped out if j fully defaults, capped at 1."""
        return np.minimum(1.0, self.exposure / self.equity[:, None])

    def economic_value_weights(self) -> np.ndarray:
        """v_i = share of total network equity held by node i (sums to 1)."""
        total = self.equity.sum()
        return self.equity / total


# Reserves/GDP are the natural loss-absorbing buffer for an ordinary
# sovereign, but they're meaningless proxies for cross-border financial
# centres (Isle of Man, Cayman, Luxembourg, Hong Kong SAR, ...): BIS counts
# every bank resident there, so reported claims/liabilities run to multiples
# of local GDP, and some report no GDP/reserves to the World Bank at all.
# Without a floor those nodes fall back to a flat constant against tens of
# billions in real exposure, saturating the impact matrix at 1 for nearly
# every edge.
#
# The floor's ratio is the country's own bank-capital-to-assets ratio (World
# Bank FB.BNK.CAPA.ZS / IMF Financial Soundness Indicators) applied to its
# gross cross-border footprint when available -- real coverage runs ~4-10%,
# meaningfully more accurate per-country than one flat number. Only
# jurisdictions with no World Bank data under any of these indicators fall
# back to the Basel III Pillar 1 minimum (8%). See BIS Working Papers No.
# 1035 and BIS Quarterly Review, June 2022, "The outsize role of cross-border
# financial centres".
DEFAULT_CAPITAL_RATIO = 0.08
EQUITY_FLOOR_USD = 1e6


def node_equity(node: dict[str, Any], gross_footprint: float) -> float:
    """The loss-absorbing buffer for one node, by the fallback chain above.

    Public because the fallback chain, not the algorithm, is what makes two
    runs of DebtRank comparable: a caller that builds its own network and
    picks a different equity proxy is not running the same model.
    """
    reserves = float(node["reserves_usd"]) if node.get("reserves_usd") else 0.0
    gdp_fallback = float(node["gdp_usd"]) * 0.01 if node.get("gdp_usd") else 0.0
    capital_ratio = (
        float(node["bank_capital_ratio_pct"]) / 100
        if node.get("bank_capital_ratio_pct")
        else DEFAULT_CAPITAL_RATIO
    )
    return max(reserves, gdp_fallback, gross_footprint * capital_ratio, EQUITY_FLOOR_USD)


def build_exposure_network(
    snapshot: dict[str, Any], include_portfolio: bool = False
) -> ExposureNetwork:
    """Builds the network the models run on from a pipeline snapshot.

    `snapshot` is one of data-pipeline/out/by_year/{year}.json (also served
    at web/public/data/network/{year}.json) -- `nodes`, `edges`, and
    optionally `portfolio_edges`.

    This is deliberately part of the package's public API rather than a
    detail of the CLI. Publishing `run_debtrank` without it would ship the
    algorithm and withhold the part that decides what the numbers mean;
    every caller would reimplement the equity fallback chain slightly
    differently and get results that don't compare. It mirrors
    web/src/lib/network.ts's buildExposureNetwork -- see
    tests/test_network.py, which pins the behaviours the two share.

    `include_portfolio` adds the IMF CPIS bond/equity layer into the same
    matrix, matching the web app's "Include portfolio investment" toggle.
    Like the web app, those edges are deliberately left out of the gross
    footprint that feeds the equity floor, so a node's loss buffer doesn't
    move depending on whether the layer is on.
    """
    node_ids = [n["id"] for n in snapshot["nodes"]]
    index = {nid: i for i, nid in enumerate(node_ids)}
    n = len(node_ids)

    exposure = np.zeros((n, n))
    gross_footprint = np.zeros(n)
    for edge in snapshot["edges"]:
        i, j = index.get(edge["creditor"]), index.get(edge["debtor"])
        if i is None or j is None:
            continue
        exposure[i, j] += edge["amount"]
        gross_footprint[i] += edge["amount"]
        gross_footprint[j] += edge["amount"]

    if include_portfolio:
        for edge in snapshot.get("portfolio_edges") or []:
            i, j = index.get(edge["creditor"]), index.get(edge["debtor"])
            if i is None or j is None:
                continue
            exposure[i, j] += edge["amount"]

    equity = np.array(
        [node_equity(node, gross_footprint[i]) for i, node in enumerate(snapshot["nodes"])],
        dtype=float,
    )
    return ExposureNetwork(node_ids=node_ids, exposure=exposure, equity=equity)
