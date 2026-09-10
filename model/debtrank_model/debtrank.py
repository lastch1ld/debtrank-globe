from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Union

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


@dataclass(frozen=True)
class Shock:
    """An exogenous shock to one node, optionally arriving late.

    level: initial distress in (0, 1].
    delay: which propagation round it arrives in. 0 (the default) is the
        classic simultaneous shock; a positive delay is what makes
        "Greece, then Portugal two rounds later" expressible.
    """

    level: float
    delay: int = 0


ShockInput = Union[float, Shock]


def run_debtrank(
    network: ExposureNetwork,
    shocked_nodes: Mapping[str, ShockInput],
    max_iterations: int = 100,
) -> DebtRankResult:
    """Run the DebtRank distress-propagation algorithm.

    shocked_nodes: mapping of node_id -> initial distress level in (0, 1],
        or a Shock carrying a `delay` in propagation rounds. A bare float
        means delay 0, so existing callers are unaffected.

    Each round, only nodes that were newly distressed in the *previous*
    round propagate impact to the nodes exposed to them; those nodes then
    move to INACTIVE so they cannot propagate twice (this is what keeps
    DebtRank from double-counting reverberating loops in the network).

    A delayed shock deliberately re-arms its node even if that node has
    already gone INACTIVE. INACTIVE exists to stop *propagated* distress
    from reverberating around a loop and being counted twice; a late
    exogenous shock is new information entering the system, not recirculated
    distress, so it gets to propagate. Without that, "Portugal defaults two
    rounds after Greece" would silently do nothing whenever Portugal had
    already been hit by the first wave -- which is exactly the case anyone
    modelling a sequence cares about.

    `debtrank` is net of everything injected from outside, at whatever round
    it arrived, so a sequence's aggregate stays comparable with a
    simultaneous one.
    """
    n = network.n
    A = network.impact_matrix()

    arrivals: dict[int, list[tuple[int, float]]] = {}
    for node_id, spec in shocked_nodes.items():
        shock = spec if isinstance(spec, Shock) else Shock(level=float(spec))
        if shock.delay < 0:
            raise ValueError(f"shock delay must be >= 0, got {shock.delay} for {node_id}")
        arrivals.setdefault(shock.delay, []).append(
            (network.node_ids.index(node_id), shock.level)
        )

    h = np.zeros(n)
    state = np.full(n, UNDISTRESSED, dtype=object)
    # Total distress pushed in from outside, per node -- subtracted from the
    # aggregate at the end so a shock is never counted as its own impact.
    injected = np.zeros(n)

    def apply_arrivals(round_index: int) -> None:
        for idx, level in arrivals.get(round_index, []):
            raised = max(0.0, min(1.0, level) - h[idx])
            injected[idx] += raised
            h[idx] = min(1.0, max(h[idx], level))
            if raised > 0:
                state[idx] = DISTRESSED

    apply_arrivals(0)
    history = [h.copy()]
    last_arrival = max(arrivals) if arrivals else 0

    for round_index in range(max_iterations):
        distressed_mask = state == DISTRESSED
        if not distressed_mask.any() and round_index >= last_arrival:
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
        apply_arrivals(round_index + 1)
        history.append(h.copy())

    v = network.economic_value_weights()
    debtrank_value = float((h - injected) @ v)

    return DebtRankResult(
        node_ids=list(network.node_ids),
        history=history,
        final_distress=h,
        debtrank=debtrank_value,
    )
