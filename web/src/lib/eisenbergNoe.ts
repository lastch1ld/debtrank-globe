/**
 * TypeScript port of the Eisenberg-Noe clearing vector, implemented and
 * correctness-tested in Python at model/debtrank_model/eisenberg_noe.py.
 * Kept structurally identical so both can be checked against the same
 * fixtures -- see eisenbergNoe.test.ts.
 */

export interface ClearingResult {
  nodeIds: string[];
  payments: number[]; // p*, the clearing payment vector
  nominalLiabilities: number[]; // p_bar
  iterations: number;
}

export function shortfall(result: ClearingResult): number[] {
  return result.nominalLiabilities.map((pBar, i) => pBar - result.payments[i]);
}

/**
 * Eisenberg-Noe (2001) clearing payment vector.
 *
 * liabilities[i][j]: nominal liability owed by node i to node j.
 * externalAssets[i]: node i's exogenous assets/cash flow (e_i).
 *
 * Solves for the greatest clearing vector p* satisfying, for every i:
 *   p_i = min(p_bar_i, e_i + sum_j Pi[j][i] * p_j)
 * where p_bar_i = sum_j liabilities[i][j] (total nominal obligations of i)
 * and Pi[j][i] = liabilities[j][i] / p_bar_j (share of j's obligations owed
 * to i). Found by the standard monotone iteration starting from p^0 = p_bar
 * and iterating downward -- this converges to the (unique, greatest)
 * clearing vector because the update operator is monotone non-decreasing
 * and bounded below by 0 (Eisenberg & Noe, Theorem 2).
 */
export function clearingVector(
  nodeIds: string[],
  liabilities: number[][],
  externalAssets: number[],
  maxIterations = 1000,
  tol = 1e-10,
): ClearingResult {
  const n = nodeIds.length;

  const pBar = liabilities.map((row) => row.reduce((a, b) => a + b, 0));
  const pi: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    if (pBar[i] > 0) {
      for (let j = 0; j < n; j++) pi[i][j] = liabilities[i][j] / pBar[i];
    }
  }

  let p = pBar.slice();
  let iterations = 0;
  for (iterations = 1; iterations <= maxIterations; iterations++) {
    const pNext = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let incoming = 0;
      for (let j = 0; j < n; j++) incoming += pi[j][i] * p[j];
      pNext[i] = Math.max(0, Math.min(pBar[i], externalAssets[i] + incoming));
    }
    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(pNext[i] - p[i]));
    p = pNext;
    if (maxDiff < tol) break;
  }

  return {
    nodeIds: nodeIds.slice(),
    payments: p,
    nominalLiabilities: pBar,
    iterations,
  };
}
