/**
 * TypeScript port of the DebtRank algorithm implemented and correctness-tested
 * in Python at model/debtrank_model/debtrank.py. Kept deliberately structurally
 * identical (same impact-matrix construction, same U/D/I state machine) so the
 * two implementations can be checked against the same fixtures --
 * see debtrank.test.ts.
 */

/** Which fallback in equityFor()'s chain actually produced a node's equity
 * value. Only "reserves" is a real observed figure; the rest are modeled
 * proxies -- UI-only metadata, never read by the algorithm below, so there's
 * no Python-side equivalent (same as financialCenters.ts). */
export type EquitySource = "reserves" | "gdp" | "capital_ratio" | "floor";

export interface ExposureNetwork {
  nodeIds: string[];
  /** exposure[i][j] = economic value of node i's exposure to node j. */
  exposure: number[][];
  /** equity[i] = node i's loss-absorbing buffer. */
  equity: number[];
  /** equitySource[i] = provenance of equity[i], for UI transparency only. */
  equitySource?: EquitySource[];
}

export interface DebtRankResult {
  nodeIds: string[];
  history: number[][]; // h(t) for t = 0..T
  finalDistress: number[];
  debtrank: number;
}

type State = "U" | "D" | "I";

function impactMatrix(net: ExposureNetwork): number[][] {
  const n = net.nodeIds.length;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i][j] = Math.min(1, net.exposure[i][j] / net.equity[i]);
    }
  }
  return A;
}

function economicValueWeights(net: ExposureNetwork): number[] {
  const total = net.equity.reduce((a, b) => a + b, 0);
  return net.equity.map((e) => e / total);
}

/** An exogenous shock to one node, optionally arriving late. `delay` is the
 * propagation round it lands in; 0 is the classic simultaneous shock. */
export interface Shock {
  level: number;
  delay?: number;
}

export type ShockInput = number | Shock;

/**
 * `shockedNodes` maps node id to an initial distress level in (0, 1], or a
 * Shock carrying a `delay`. A bare number means delay 0, so existing callers
 * are unaffected.
 *
 * A delayed shock deliberately re-arms its node even if that node has
 * already gone "I". "I" exists to stop *propagated* distress from
 * reverberating around a loop and being counted twice; a late exogenous
 * shock is new information entering the system, not recirculated distress,
 * so it gets to propagate. Without that, "Portugal defaults two rounds after
 * Greece" would silently do nothing whenever Portugal had already been hit
 * by the first wave -- exactly the case anyone modelling a sequence cares
 * about.
 *
 * `debtrank` is net of everything injected from outside, at whatever round
 * it arrived, so a sequence's aggregate stays comparable with a simultaneous
 * one.
 */
export function runDebtRank(
  net: ExposureNetwork,
  shockedNodes: Record<string, ShockInput>,
  maxIterations = 100,
): DebtRankResult {
  const n = net.nodeIds.length;
  const A = impactMatrix(net);
  const index = new Map(net.nodeIds.map((id, i) => [id, i]));

  let h = new Array(n).fill(0);
  let state: State[] = new Array(n).fill("U");
  // Total distress pushed in from outside, per node -- subtracted from the
  // aggregate at the end so a shock is never counted as its own impact.
  const injected = new Array(n).fill(0);

  const arrivals = new Map<number, [number, number][]>();
  for (const [nodeId, spec] of Object.entries(shockedNodes)) {
    const idx = index.get(nodeId);
    if (idx === undefined) continue;
    const level = typeof spec === "number" ? spec : spec.level;
    const delay = typeof spec === "number" ? 0 : Math.max(0, Math.trunc(spec.delay ?? 0));
    const at = arrivals.get(delay) ?? [];
    at.push([idx, level]);
    arrivals.set(delay, at);
  }
  const lastArrival = arrivals.size > 0 ? Math.max(...arrivals.keys()) : 0;

  function applyArrivals(round: number) {
    for (const [idx, level] of arrivals.get(round) ?? []) {
      const raised = Math.max(0, Math.min(1, level) - h[idx]);
      injected[idx] += raised;
      h[idx] = Math.min(1, Math.max(h[idx], level));
      if (raised > 0) state[idx] = "D";
    }
  }

  applyArrivals(0);
  const history: number[][] = [h.slice()];

  for (let iter = 0; iter < maxIterations; iter++) {
    const distressedIdx = state
      .map((s, i) => (s === "D" ? i : -1))
      .filter((i) => i >= 0);
    if (distressedIdx.length === 0 && iter >= lastArrival) break;

    const incoming = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const j of distressedIdx) {
        sum += A[i][j] * h[j];
      }
      incoming[i] = sum;
    }

    // Inactive nodes are frozen: they already propagated once and must not
    // accumulate further distress from later rounds, even though `incoming`
    // is computed for every node above.
    const hNext = h.map((v, i) => (state[i] === "I" ? v : Math.min(1, v + incoming[i])));
    const newState = state.slice();
    for (const i of distressedIdx) newState[i] = "I";
    for (let i = 0; i < n; i++) {
      if (hNext[i] > h[i] && newState[i] !== "I") newState[i] = "D";
    }

    h = hNext;
    state = newState;
    applyArrivals(iter + 1);
    history.push(h.slice());
  }

  const v = economicValueWeights(net);
  let debtrank = 0;
  for (let i = 0; i < n; i++) debtrank += (h[i] - injected[i]) * v[i];

  return {
    nodeIds: net.nodeIds.slice(),
    history,
    finalDistress: h,
    debtrank,
  };
}
