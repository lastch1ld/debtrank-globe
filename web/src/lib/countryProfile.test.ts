import { describe, expect, it } from "vitest";
import { buildCountryProfile } from "./countryProfile";
import type { YearSnapshot } from "./network";

const node = (id: string, extra = {}) => ({
  id,
  gdp_usd: null,
  reserves_usd: null,
  external_debt_usd: null,
  bank_capital_ratio_pct: null,
  ...extra,
});

const snapshot: YearSnapshot = {
  nodes: [
    node("GRC", { gdp_usd: 200e9, reserves_usd: 10e9, external_debt_usd: 400e9 }),
    node("DEU"),
    node("FRA"),
    node("USA"),
  ],
  edges: [
    { creditor: "DEU", debtor: "GRC", amount: 30e9 },
    { creditor: "FRA", debtor: "GRC", amount: 10e9 },
    { creditor: "GRC", debtor: "USA", amount: 2e9 },
  ],
};

describe("buildCountryProfile", () => {
  const p = buildCountryProfile(snapshot, "GRC")!;

  it("derives the ratios from the reported figures", () => {
    expect(p.externalDebtToGdp).toBeCloseTo(2);
    expect(p.reservesToExternalDebt).toBeCloseTo(0.025);
  });

  it("reports a ratio as null, not 0, when a figure is missing", () => {
    const d = buildCountryProfile(snapshot, "DEU")!;
    expect(d.externalDebtToGdp).toBeNull();
    expect(d.reservesToExternalDebt).toBeNull();
    expect(d.gdp).toBeNull();
  });

  it("uses the same equity and source the model does", () => {
    expect(p.equity).toBe(10e9);
    expect(p.equitySource).toBe("reserves");
  });

  it("totals what others hold on the country, and what it holds on others", () => {
    expect(p.liabilities).toBe(40e9);
    expect(p.claims).toBe(2e9);
  });

  it("ranks creditors by amount, with each one's share", () => {
    expect(p.creditors.map((c) => c.id)).toEqual(["DEU", "FRA"]);
    expect(p.creditors[0]).toEqual({ id: "DEU", amount: 30e9, share: 0.75 });
    expect(p.creditors.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });

  it("lists the countries it holds claims on, and counts counterparties", () => {
    expect(p.debtors).toEqual([{ id: "USA", amount: 2e9, share: 1 }]);
    expect(p.creditorCount).toBe(2);
    expect(p.debtorCount).toBe(1);
    expect(p.counterpartyCount).toBe(3);
  });

  it("keeps only the five largest", () => {
    const ids = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"];
    const big: YearSnapshot = {
      nodes: [],
      edges: ids.map((c, k) => ({ creditor: c, debtor: "GRC", amount: (k + 1) * 1e9 })),
    };
    // None of these ids are in the country list, so go through GRC only.
    const prof = buildCountryProfile({ ...big, nodes: [node("GRC")] }, "GRC")!;
    expect(prof.creditors).toHaveLength(5);
    expect(prof.creditors[0].id).toBe("A7");
    expect(prof.creditorCount).toBe(7);
  });

  it("returns null for a country not in the network", () => {
    expect(buildCountryProfile(snapshot, "XXX")).toBeNull();
  });

  it("ignores the withdrawn portfolio layer even if a snapshot still carries edges in it", () => {
    const stale: YearSnapshot = {
      ...snapshot,
      portfolio_edges: [{ creditor: "USA", debtor: "GRC", amount: 50e9 }],
    };
    expect(buildCountryProfile(stale, "GRC")).toEqual(p);
  });
});
