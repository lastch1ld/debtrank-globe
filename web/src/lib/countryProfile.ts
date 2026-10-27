import type { EquitySource } from "./debtrank";
import {
  buildExposureNetwork,
  type ExposureEdge,
  type YearSnapshot,
} from "./network";

export interface Counterparty {
  id: string;
  /** USD this counterparty holds (or is held by) the country. */
  amount: number;
  /** This counterparty's share of the country's total in that direction. */
  share: number;
}

export interface CountryProfile {
  gdp: number | null;
  reserves: number | null;
  externalDebt: number | null;
  externalDebtToGdp: number | null;
  reservesToExternalDebt: number | null;
  /** The loss buffer the model actually divides by, and where it came from. */
  equity: number;
  equitySource: EquitySource;
  /** What this country's banks and investors hold on others. */
  claims: number;
  /** What others hold on this country. */
  liabilities: number;
  /** Largest holders of claims on this country. */
  creditors: Counterparty[];
  /** Largest countries this country holds claims on. */
  debtors: Counterparty[];
  creditorCount: number;
  debtorCount: number;
  /** Distinct countries on either side. */
  counterpartyCount: number;
}

const TOP = 5;

/** Null, never 0, when either side is missing: "not reported" is not zero. */
const ratio = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? a / b : null;

/** Edges touching `id` in one direction, summed per counterparty. */
function byCounterparty(
  edges: ExposureEdge[],
  id: string,
  side: "creditor" | "debtor",
): Map<string, number> {
  const other = side === "creditor" ? "debtor" : "creditor";
  const out = new Map<string, number>();
  for (const e of edges) {
    if (e[side] !== id) continue;
    out.set(e[other], (out.get(e[other]) ?? 0) + e.amount);
  }
  return out;
}

const sum = (rows: Iterable<number>): number => {
  let total = 0;
  for (const r of rows) total += r;
  return total;
};

const top = (rows: Map<string, number>, total: number): Counterparty[] =>
  [...rows]
    .map(([id, amount]) => ({ id, amount, share: total > 0 ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP);

/** Everything the country panel shows, from the year's snapshot alone: the
 * panel describes the country, not the scenario. Null if the country isn't
 * in the network. */
export function buildCountryProfile(
  yearData: YearSnapshot,
  id: string,
): CountryProfile | null {
  const network = buildExposureNetwork(yearData);
  const i = network.nodeIds.indexOf(id);
  if (i < 0) return null;

  const node = yearData.nodes.find((n) => n.id === id);
  const gdp = node?.gdp_usd ?? null;
  const reserves = node?.reserves_usd ?? null;
  const externalDebt = node?.external_debt_usd ?? null;

  const creditorRows = byCounterparty(yearData.edges, id, "debtor");
  const debtorRows = byCounterparty(yearData.edges, id, "creditor");
  const liabilities = sum(creditorRows.values());
  const claims = sum(debtorRows.values());

  return {
    gdp,
    reserves,
    externalDebt,
    externalDebtToGdp: ratio(externalDebt, gdp),
    reservesToExternalDebt: ratio(reserves, externalDebt),
    equity: network.equity[i],
    equitySource: network.equitySource?.[i] ?? "floor",
    claims,
    liabilities,
    creditors: top(creditorRows, liabilities),
    debtors: top(debtorRows, claims),
    creditorCount: creditorRows.size,
    debtorCount: debtorRows.size,
    counterpartyCount: new Set([...creditorRows.keys(), ...debtorRows.keys()])
      .size,
  };
}
