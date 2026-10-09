import { impactMatrix } from "./debtrank";
import { YEARS, buildExposureNetwork, loadYearData } from "./network";

/** The largest eigenvalue of a non-negative square matrix, by power
 * iteration on I + A (the shift keeps it from oscillating on matrices whose
 * cycles have even length). Rows are walked sparsely: an impact matrix over
 * ~200 countries is mostly zeros. */
// ponytail: plain power iteration converges like 1/k when the matrix has a
// loop-free part (a defective eigenvalue), so a network with no cycles reads
// about 0.001 rather than exactly 0 after 2000 steps. Real networks have a
// large cyclic core, where it converges geometrically; swap in a sparse
// eigensolver if a loop-free case ever has to be exact.
export function spectralRadius(
  A: number[][],
  maxIterations = 2000,
  tol = 1e-12,
): number {
  const n = A.length;
  const rows = A.map((row) => {
    const entries: [number, number][] = [];
    row.forEach((v, j) => {
      if (v !== 0) entries.push([j, v]);
    });
    return entries;
  });

  let x = new Array<number>(n).fill(1);
  let lambda = 0;
  for (let k = 0; k < maxIterations; k++) {
    const next = x.slice(); // the identity part
    for (let i = 0; i < n; i++)
      for (const [j, v] of rows[i]) next[i] += v * x[j];
    const norm = next.reduce((a, b) => a + b, 0);
    const growth = norm / x.reduce((a, b) => a + b, 0);
    x = next.map((v) => v / norm);
    if (Math.abs(growth - lambda) < tol) return Math.max(0, growth - 1);
    lambda = growth;
  }
  return Math.max(0, lambda - 1);
}

export interface StabilityPoint {
  year: number;
  /** Spectral radius of the impact matrix A[i][j] = exposure[i][j] / equity[i], capped at 1. */
  radius: number;
}

const cache = new Map<boolean, StabilityPoint[]>();

/** The spectral radius of the impact matrix for every year. Loads each year's
 * file the way "View across years" does (and shares its cache), one at a
 * time, and keeps the finished series so reopening the tab is instant. */
export async function computeStability(
  includePortfolio: boolean,
  onProgress?: (done: number) => void,
  cancelled?: () => boolean,
): Promise<StabilityPoint[]> {
  const hit = cache.get(includePortfolio);
  if (hit) return hit;

  const points: StabilityPoint[] = [];
  for (const year of YEARS) {
    if (cancelled?.()) throw new Error("cancelled");
    const data = await loadYearData(year);
    points.push({
      year,
      radius: spectralRadius(
        impactMatrix(buildExposureNetwork(data, { includePortfolio })),
      ),
    });
    onProgress?.(points.length);
  }
  cache.set(includePortfolio, points);
  return points;
}
