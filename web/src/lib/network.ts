import type { ExposureNetwork } from "./debtrank";
import snapshot from "../data/network_snapshot.json";

export interface CountryNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  gdpUsd: number | null;
  reservesUsd: number | null;
  externalDebtUsd: number | null;
}

interface RawSnapshot {
  nodes: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    gdp_usd: number | null;
    reserves_usd: number | null;
    external_debt_usd: number | null;
  }[];
  edges: { creditor: string; debtor: string; period: string; amount: number }[];
}

const raw = snapshot as RawSnapshot;

// Same equity fallback as model/debtrank_model/cli.py: reserves are the
// natural sovereign loss-absorbing buffer, falling back to a slice of GDP,
// then a floor, so every node has strictly positive equity.
function equityFor(n: RawSnapshot["nodes"][number]): number {
  if (n.reserves_usd) return n.reserves_usd;
  if (n.gdp_usd) return n.gdp_usd * 0.01;
  return 1e6;
}

export const countries: CountryNode[] = raw.nodes
  .filter((n) => n.lat !== null && n.lng !== null)
  .map((n) => ({
    id: n.id,
    name: n.name,
    lat: n.lat as number,
    lng: n.lng as number,
    gdpUsd: n.gdp_usd,
    reservesUsd: n.reserves_usd,
    externalDebtUsd: n.external_debt_usd,
  }));

export function buildExposureNetwork(): ExposureNetwork {
  const nodeIds = countries.map((c) => c.id);
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  const n = nodeIds.length;
  const equity = raw.nodes
    .filter((rn) => index.has(rn.id))
    .sort((a, b) => index.get(a.id)! - index.get(b.id)!)
    .map(equityFor);

  const exposure: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of raw.edges) {
    const i = index.get(e.creditor);
    const j = index.get(e.debtor);
    if (i === undefined || j === undefined) continue;
    exposure[i][j] += e.amount;
  }

  return { nodeIds, exposure, equity };
}

/** Total in + out exposure for a country, used to size its marker. */
export function totalExposure(countryId: string): number {
  let total = 0;
  for (const e of raw.edges) {
    if (e.creditor === countryId || e.debtor === countryId) total += e.amount;
  }
  return total;
}

export function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}
