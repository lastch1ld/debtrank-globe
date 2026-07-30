from __future__ import annotations

from dataclasses import dataclass

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
