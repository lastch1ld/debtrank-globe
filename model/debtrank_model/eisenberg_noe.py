from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class ClearingResult:
    node_ids: list[str]
    payments: np.ndarray  # p*, the clearing payment vector
    nominal_liabilities: np.ndarray  # p_bar
    iterations: int

    def shortfall(self) -> np.ndarray:
        """How far each node fell short of its full obligations (0 if it paid in full)."""
        return self.nominal_liabilities - self.payments


def clearing_vector(
    node_ids: list[str],
    liabilities: np.ndarray,
    external_assets: np.ndarray,
    max_iterations: int = 1000,
    tol: float = 1e-10,
) -> ClearingResult:
    """Eisenberg-Noe (2001) clearing payment vector.

    liabilities[i, j]: nominal liability owed by node i to node j.
    external_assets[i]: node i's exogenous assets/cash flow (e_i).

    Solves for the greatest clearing vector p* satisfying, for every i:
        p_i = min(p_bar_i, e_i + sum_j Pi[j, i] * p_j)
    where p_bar_i = sum_j liabilities[i, j] (total nominal obligations of i)
    and Pi[j, i] = liabilities[j, i] / p_bar_j (share of j's obligations owed to i).

    Found by the standard monotone iteration starting from p^0 = p_bar and
    iterating downward; this converges to the (unique, greatest) clearing
    vector because the update operator is monotone non-decreasing and
    bounded below by 0 (Eisenberg & Noe, Theorem 2).
    """
    n = len(node_ids)
    if liabilities.shape != (n, n):
        raise ValueError(f"liabilities must be {n}x{n}, got {liabilities.shape}")
    if external_assets.shape != (n,):
        raise ValueError(f"external_assets must have shape ({n},)")

    p_bar = liabilities.sum(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        pi = np.where(p_bar[:, None] > 0, liabilities / p_bar[:, None], 0.0)

    p = p_bar.copy()
    iterations = 0
    for iterations in range(1, max_iterations + 1):
        incoming = pi.T @ p
        p_next = np.minimum(p_bar, external_assets + incoming)
        p_next = np.maximum(p_next, 0.0)
        if np.max(np.abs(p_next - p)) < tol:
            p = p_next
            break
        p = p_next

    return ClearingResult(
        node_ids=list(node_ids),
        payments=p,
        nominal_liabilities=p_bar,
        iterations=iterations,
    )
