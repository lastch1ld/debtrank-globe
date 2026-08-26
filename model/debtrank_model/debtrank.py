from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .network import ExposureNetwork

UNDISTRESSED = "U"
DISTRESSED = "D"
INACTIVE = "I"


@dataclass
class DebtRankResult:
    node_ids: list[str]
    history: list[np.ndarray] = field(default_factory=list)  # h(t) for t = 0..T
    final_distress: np.ndarray = field(default_factory=lambda: np.array([]))
    debtrank: float = 0.0  # aggregate impact, net of the initial shock itself

    def distress_of(self, node_id: str) -> float:
        return float(self.final_distress[self.node_ids.index(node_id)])


def run_debtrank(
    network: ExposureNetwork,
    shocked_nodes: dict[str, float],
    max_iterations: int = 100,
) -> DebtRankResult:
    """Run the DebtRank distress-propagation algorithm.

    shocked_nodes: mapping of node_id -> initial distress level in (0, 1].

    Each round, only nodes that were newly distressed in the *previous*
    round propagate impact to the nodes exposed to them; those nodes then
    move to INACTIVE so they cannot propagate twice (this is what keeps
    DebtRank from double-counting reverberating loops in the network).
    """
    n = network.n
    A = network.impact_matrix()

    h = np.zeros(n)
    state = np.full(n, UNDISTRESSED, dtype=object)
    for node_id, level in shocked_nodes.items():
        idx = network.node_ids.index(node_id)
        h[idx] = level
        state[idx] = DISTRESSED

    history = [h.copy()]

    for _ in range(max_iterations):
        distressed_mask = state == DISTRESSED
        if not distressed_mask.any():
            break

        # Impact felt by every node from currently-distressed neighbors this round.
        incoming = A[:, distressed_mask] @ h[distressed_mask]

        # Inactive nodes are frozen: they already propagated once and must
        # not accumulate further distress from later rounds, even though
        # `incoming` is computed for every node above.
        h_next = np.where(state == INACTIVE, h, np.minimum(1.0, h + incoming))

        new_state = state.copy()
        # Nodes that were distressed this round have now "used up" their
        # propagation and become inactive.
        new_state[distressed_mask] = INACTIVE
        # Any node whose distress increased and isn't already inactive becomes distressed.
        newly_hit = (h_next > h) & (new_state != INACTIVE)
        new_state[newly_hit] = DISTRESSED

        h, state = h_next, new_state
        history.append(h.copy())

    v = network.economic_value_weights()
    initial = history[0]
    debtrank_value = float((h - initial) @ v)

    return DebtRankResult(
        node_ids=list(network.node_ids),
        history=history,
        final_distress=h,
        debtrank=debtrank_value,
    )
