import { describe, expect, it } from "vitest";
import { buildExposureNetwork, type YearSnapshot } from "./network";
import { buildPairProfile, pairSeries, sparklinePoints, type PairIndex } from "./pairProfile";

const node = (id: string, reserves: number | null) => ({
  id,
  gdp_usd: null,
  reserves_usd: reserves,
  external_debt_usd: null,
  bank_capital_ratio_pct: null,
});

const snapshot: YearSnapshot = {
  nodes: [node("GRC", 10e9), node("DEU", 100e9)],
  edges: [
    { creditor: "DEU", debtor: "GRC", amount: 30e9 },
    { creditor: "GRC", debtor: "DEU", amount: 2e9 },
  ],
  portfolio_edges: [{ creditor: "DEU", debtor: "GRC", amount: 20e9 }],
};

describe("buildPairProfile", () => {
  it("splits each direction by layer, whatever the toggle", () => {
    const net = buildExposureNetwork(snapshot);
    const p = buildPairProfile(snapshot, net, "GRC", "DEU")!;
    expect(p.ba).toMatchObject({ from: "DEU", to: "GRC", bank: 30e9, portfolio: 20e9, total: 50e9 });
    expect(p.ab).toMatchObject({ from: "GRC", to: "DEU", bank: 2e9, portfolio: 0, total: 2e9 });
  });

  it("takes the impact ratio from the network the model runs on", () => {
    const bankOnly = buildPairProfile(snapshot, buildExposureNetwork(snapshot), "GRC", "DEU")!;
    const both = buildPairProfile(snapshot, buildExposureNetwork(snapshot, { includePortfolio: true }), "GRC", "DEU")!;
    expect(bankOnly.ba.impactRatio).toBeCloseTo(0.3); // 30B of DEU's 100B buffer
    expect(both.ba.impactRatio).toBeCloseTo(0.5);
    expect(bankOnly.ab.impactRatio).toBe(0.2); // 2B of GRC's 10B
  });

  it("caps the ratio at 1 and is null for a country outside the network", () => {
    const big: YearSnapshot = { ...snapshot, edges: [{ creditor: "GRC", debtor: "DEU", amount: 500e9 }] };
    expect(buildPairProfile(big, buildExposureNetwork(big), "GRC", "DEU")!.ab.impactRatio).toBe(1);
    expect(buildPairProfile(snapshot, buildExposureNetwork(snapshot), "GRC", "XXX")).toBeNull();
  });
});

describe("pairSeries", () => {
  const index: PairIndex = {
    first_year: 2005,
    unit: "usd_millions",
    pairs: { "DEU|GRC": { ab: [1, 2], ba: [3, 4] } }, // ab = DEU's claim on GRC
  };

  it("orients the series for whichever country is asked first", () => {
    expect(pairSeries(index, "DEU", "GRC")).toEqual({ firstYear: 2005, aOnB: [1e6, 2e6], bOnA: [3e6, 4e6] });
    expect(pairSeries(index, "GRC", "DEU")).toEqual({ firstYear: 2005, aOnB: [3e6, 4e6], bOnA: [1e6, 2e6] });
  });

  it("is null for a pair below the index threshold", () => {
    expect(pairSeries(index, "DEU", "FRA")).toBeNull();
  });
});

describe("sparklinePoints", () => {
  it("puts 0 at the bottom and the max at the top, spread across the width", () => {
    expect(sparklinePoints([0, 5, 10], 100, 20, 10)).toBe("0.0,20.0 50.0,10.0 100.0,0.0");
  });

  it("draws a flat baseline when everything is zero", () => {
    expect(sparklinePoints([0, 0], 10, 10, 0)).toBe("0.0,10.0 10.0,10.0");
  });
});
