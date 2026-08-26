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

export function runDebtRank(
  net: ExposureNetwork,
  shockedNodes: Record<string, number>,
  maxIterations = 100,
): DebtRankResult {
  const n = net.nodeIds.length;
  const A = impactMatrix(net);
  const index = new Map(net.nodeIds.map((id, i) => [id, i]));

  let h = new Array(n).fill(0);
  let state: State[] = new Array(n).fill("U");

  for (const [nodeId, level] of Object.entries(shockedNodes)) {
    const idx = index.get(nodeId);
    if (idx === undefined) continue;
    h[idx] = level;
    state[idx] = "D";
  }

  const history: number[][] = [h.slice()];

  for (let iter = 0; iter < maxIterations; iter++) {
    const distressedIdx = state
      .map((s, i) => (s === "D" ? i : -1))
      .filter((i) => i >= 0);
    if (distressedIdx.length === 0) break;

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
    history.push(h.slice());
  }

  const v = economicValueWeights(net);
  const initial = history[0];
  let debtrank = 0;
  for (let i = 0; i < n; i++) debtrank += (h[i] - initial[i]) * v[i];

  return {
    nodeIds: net.nodeIds.slice(),
    history,
    finalDistress: h,
    debtrank,
  };
}
