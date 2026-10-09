import type { ExposureNetwork } from "./debtrank";
import type { YearSnapshot } from "./network";

export interface Direction {
  /** `from` holds a claim on `to`. */
  from: string;
  to: string;
  bank: number;
  portfolio: number;
  total: number;
  /** The share of `from`'s loss buffer this claim uses in the model run on
   * `network`, capped at 1: the weight DebtRank gives this channel. */
  impactRatio: number;
}

export interface PairProfile {
  ab: Direction;
  ba: Direction;
}

const sumEdges = (edges: YearSnapshot["edges"], from: string, to: string) =>
  edges.reduce((s, e) => (e.creditor === from && e.debtor === to ? s + e.amount : s), 0);

/** Both directions of a pair for one year, each split by layer, with the
 * impact ratio taken from the network the model actually runs on (so it
 * follows the portfolio toggle, while the layer split always shows both).
 * Null if either country is not in the network. */
export function buildPairProfile(yearData: YearSnapshot, network: ExposureNetwork, a: string, b: string): PairProfile | null {
  const ia = network.nodeIds.indexOf(a);
  const ib = network.nodeIds.indexOf(b);
  if (ia < 0 || ib < 0) return null;

  const direction = (from: string, to: string, i: number, j: number): Direction => {
    const bank = sumEdges(yearData.edges, from, to);
    const portfolio = sumEdges(yearData.portfolio_edges ?? [], from, to);
    return {
      from,
      to,
      bank,
      portfolio,
      total: bank + portfolio,
      impactRatio: Math.min(1, network.exposure[i][j] / network.equity[i]),
    };
  };
  return { ab: direction(a, b, ia, ib), ba: direction(b, a, ib, ia) };
}

// --- history (web/public/data/network/pairs.json, built by data-pipeline/build_pairs.py)

export interface PairIndex {
  first_year: number;
  unit: "usd_millions";
  pairs: Record<string, { ab: number[]; ba: number[] }>;
}

export interface PairSeries {
  firstYear: number;
  /** USD, one value per year from firstYear. */
  aOnB: number[];
  bOnA: number[];
}

/** The index keys a pair by its two ids sorted, with `ab` the sorted-first
 * country's claim on the other; this re-orients that for (a, b). Null when
 * the pair is below the index's size threshold. */
export function pairSeries(index: PairIndex, a: string, b: string): PairSeries | null {
  const [first, second] = a < b ? [a, b] : [b, a];
  const entry = index.pairs[`${first}|${second}`];
  if (!entry) return null;
  const usd = (xs: number[]) => xs.map((v) => v * 1e6);
  const [aOnB, bOnA] = a === first ? [entry.ab, entry.ba] : [entry.ba, entry.ab];
  return { firstYear: index.first_year, aOnB: usd(aOnB), bOnA: usd(bOnA) };
}

let indexPromise: Promise<PairIndex> | null = null;

/** Fetches pairs.json once. A failed fetch is not cached, so reopening the
 * pair view retries. */
export function loadPairIndex(): Promise<PairIndex> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/network/pairs.json`)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load pair history");
      return res.json() as Promise<PairIndex>;
    })
    .catch((err) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

/** SVG polyline points for `values` scaled to a `width` x `height` box, with
 * 0 at the bottom and `max` at the top. */
export function sparklinePoints(values: number[], width: number, height: number, max: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (max > 0 ? (v / max) * height : 0)).toFixed(1)}`)
    .join(" ");
}
