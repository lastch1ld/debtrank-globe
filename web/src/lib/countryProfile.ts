import type { EquitySource } from "./debtrank";
import {
  buildExposureNetwork,
  type ExposureEdge,
  type YearSnapshot,
} from "./network";

export interface LayerAmounts {
  bank: number;
  portfolio: number;
  total: number;
}

export interface Counterparty extends LayerAmounts {
  id: string;
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
  claims: LayerAmounts;
  /** What others hold on this country. */
  liabilities: LayerAmounts;
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

/** Edges touching `id` in one direction, summed per counterparty and layer. */
function byCounterparty(
  bank: ExposureEdge[],
  portfolio: ExposureEdge[],
  id: string,
  side: "creditor" | "debtor",
): Map<string, LayerAmounts> {
  const other = side === "creditor" ? "debtor" : "creditor";
  const out = new Map<string, LayerAmounts>();
  const add = (edges: ExposureEdge[], layer: "bank" | "portfolio") => {
    for (const e of edges) {
      if (e[side] !== id) continue;
      const row = out.get(e[other]) ?? { bank: 0, portfolio: 0, total: 0 };
      row[layer] += e.amount;
      row.total += e.amount;
      out.set(e[other], row);
    }
  };
  add(bank, "bank");
  add(portfolio, "portfolio");
  return out;
}

const sum = (rows: Iterable<LayerAmounts>): LayerAmounts => {
  const t = { bank: 0, portfolio: 0, total: 0 };
  for (const r of rows) {
    t.bank += r.bank;
    t.portfolio += r.portfolio;
    t.total += r.total;
  }
  return t;
};

const top = (rows: Map<string, LayerAmounts>, total: number): Counterparty[] =>
  [...rows]
    .map(([id, r]) => ({ id, ...r, share: total > 0 ? r.total / total : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP);

/** Everything the country panel shows, from the year's snapshot alone. Both
 * layers are always included and split, whatever the portfolio toggle says:
 * the panel describes the country, not the scenario. Null if the country
 * isn't in the network. */
export function buildCountryProfile(
  yearData: YearSnapshot,
  id: string,
): CountryProfile | null {
  // The equity does not depend on the portfolio toggle by design.
  const network = buildExposureNetwork(yearData);
  const i = network.nodeIds.indexOf(id);
  if (i < 0) return null;

  const node = yearData.nodes.find((n) => n.id === id);
  const gdp = node?.gdp_usd ?? null;
  const reserves = node?.reserves_usd ?? null;
  const externalDebt = node?.external_debt_usd ?? null;

  const portfolioEdges = yearData.portfolio_edges ?? [];
  const creditorRows = byCounterparty(
    yearData.edges,
    portfolioEdges,
    id,
    "debtor",
  );
  const debtorRows = byCounterparty(
    yearData.edges,
    portfolioEdges,
    id,
    "creditor",
  );
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
    creditors: top(creditorRows, liabilities.total),
    debtors: top(debtorRows, claims.total),
    creditorCount: creditorRows.size,
    debtorCount: debtorRows.size,
    counterpartyCount: new Set([...creditorRows.keys(), ...debtorRows.keys()])
      .size,
  };
}
