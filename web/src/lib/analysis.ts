import { runDebtRank, type ExposureNetwork } from "./debtrank";
import { clearingVector } from "./eisenbergNoe";
import { YEARS, buildExposureNetwork, loadYearData } from "./network";
import { getBondYield, getPolicyRate, getStockChange } from "./marketData";

export type Model = "debtrank" | "eisenberg-noe";

export type SimResult =
  | { kind: "debtrank"; nodeIds: string[]; history: number[][]; debtrank: number }
  | { kind: "eisenberg-noe"; nodeIds: string[]; distress: number[]; iterations: number; aggregate: number };

/** Real cross-border bank liabilities routinely dwarf a country's FX
 * reserves, so an unshocked Eisenberg-Noe clearing vector already shows many
 * countries "short" at baseline -- that's a data-scale mismatch (reserves
 * aren't meant to cover gross private-sector bank claims), not contagion.
 * Callers net the shocked result against this baseline so only the shock's
 * marginal effect shows, mirroring how DebtRank nets final distress against
 * its initial state. */
export function computeBaselineShortfall(network: ExposureNetwork): number[] {
  const n = network.nodeIds.length;
  const liabilities = Array.from({ length: n }, (_, a) =>
    Array.from({ length: n }, (_, b) => network.exposure[b][a]),
  );
  const cv = clearingVector(network.nodeIds, liabilities, network.equity);
  return cv.nominalLiabilities.map((pBar, i) => (pBar > 0 ? Math.max(0, (pBar - cv.payments[i]) / pBar) : 0));
}

export function computeShockResult(
  network: ExposureNetwork,
  id: string,
  mag: number,
  mdl: Model,
  baselineShortfall: number[],
): SimResult {
  if (mdl === "debtrank") {
    const res = runDebtRank(network, { [id]: mag });
    return { kind: "debtrank", nodeIds: res.nodeIds, history: res.history, debtrank: res.debtrank };
  }

  // liabilities[a][b] = a's debt to b = exposure[b][a] (exposure[i][j] is
  // i's claim on j, so the debtor/creditor roles flip).
  const n = network.nodeIds.length;
  const liabilities = Array.from({ length: n }, (_, a) =>
    Array.from({ length: n }, (_, b) => network.exposure[b][a]),
  );
  const idx = network.nodeIds.indexOf(id);
  const externalAssets = network.equity.slice();
  if (idx >= 0) externalAssets[idx] *= 1 - mag;

  const cv = clearingVector(network.nodeIds, liabilities, externalAssets);
  const distress = cv.nominalLiabilities.map((pBar, i) => {
    if (pBar <= 0) return 0;
    const shockedShortfall = Math.max(0, (pBar - cv.payments[i]) / pBar);
    const baseline = baselineShortfall[i] ?? 0;
    return Math.max(0, shockedShortfall - baseline);
  });
  const totalEquity = network.equity.reduce((a, b) => a + b, 0);
  const aggregate = distress.reduce((sum, d, i) => sum + d * (network.equity[i] / totalEquity), 0);

  return { kind: "eisenberg-noe", nodeIds: cv.nodeIds, distress, iterations: cv.iterations, aggregate };
}

export function aggregateImpact(result: SimResult): number {
  return result.kind === "debtrank" ? result.debtrank : result.aggregate;
}

export interface YearPoint {
  year: number;
  modelImpact: number;
  bondYield: number | null;
  policyRate: number | null;
  stockChange: number | null;
}

/** Runs the given shock against every year 2005-2025, pairing the model's
 * predicted impact with that year's real market data -- the basis for the
 * "view across years" correlation chart. */
export async function runAnalysisAcrossYears(
  countryId: string,
  mag: number,
  mdl: Model,
  onProgress?: (year: number) => void,
): Promise<YearPoint[]> {
  const points: YearPoint[] = [];
  for (const year of YEARS) {
    onProgress?.(year);
    const yearData = await loadYearData(year);
    const network = buildExposureNetwork(yearData);
    const baseline = computeBaselineShortfall(network);
    const result = computeShockResult(network, countryId, mag, mdl, baseline);
    points.push({
      year,
      modelImpact: aggregateImpact(result),
      bondYield: getBondYield(countryId, year),
      policyRate: getPolicyRate(countryId, year),
      stockChange: getStockChange(countryId, year),
    });
  }
  return points;
}
