import { describe, expect, it } from "vitest";
import { buildExposureNetwork, explainExposure, topExposureEdges, type YearSnapshot } from "./network";
import type { ExposureNetwork } from "./debtrank";

describe("explainExposure", () => {
  it("reports direct exposure when it exists", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 40],
        [10, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(40);
    expect(explanation.owedToShocked).toBe(10);
    expect(explanation.viaPath).toBeNull();
  });

  it("reports the claim as a share of the claimant's equity, capped at 100%", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 40],
        [250, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    expect(explainExposure(net, "A", "B").impactRatio).toBeCloseTo(0.4);
    expect(explainExposure(net, "B", "A").impactRatio).toBe(1);
  });

  it("has no impact ratio when the node only owes the shocked country", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [10, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    expect(explainExposure(net, "A", "B").impactRatio).toBe(0);
  });

  it("falls back to the strongest one-hop intermediary when there's no direct link", () => {
    // A -> M -> B is the only chain; direct A<->B is zero.
    const net: ExposureNetwork = {
      nodeIds: ["A", "M", "B"],
      exposure: [
        [0, 30, 0],
        [0, 0, 20],
        [0, 0, 0],
      ],
      equity: [100, 100, 100],
      equitySource: ["reserves", "reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(0);
    expect(explanation.owedToShocked).toBe(0);
    expect(explanation.viaPath).toEqual(["M"]);
  });

  it("falls back to a two-hop chain when no direct or one-hop link exists", () => {
    // Only path from A to B is A -> M1 -> M2 -> B; no direct A<->B and no
    // single intermediary bridges them.
    const net: ExposureNetwork = {
      nodeIds: ["A", "M1", "M2", "B"],
      exposure: [
        [0, 25, 0, 0],
        [0, 0, 15, 0],
        [0, 0, 0, 5],
        [0, 0, 0, 0],
      ],
      equity: [100, 100, 100, 100],
      equitySource: ["reserves", "reserves", "reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(0);
    expect(explanation.owedToShocked).toBe(0);
    expect(explanation.viaPath).toEqual(["M1", "M2"]);
  });

  it("returns null viaPath when the nodes are entirely disconnected", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [0, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.viaPath).toBeNull();
  });
});

describe("buildExposureNetwork", () => {
  // USA/DEU are real country codes in the bundled country list, since
  // buildExposureNetwork indexes against that static list rather than
  // whatever's in the snapshot's own nodes array.
  const yearData: YearSnapshot = {
    nodes: [
      { id: "USA", gdp_usd: 1e13, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
      { id: "DEU", gdp_usd: 1e13, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
    ],
    edges: [{ creditor: "USA", debtor: "DEU", amount: 5e9 }],
  };

  it("builds the exposure matrix from the banking edges", () => {
    const net = buildExposureNetwork(yearData);
    expect(net.exposure[net.nodeIds.indexOf("USA")][net.nodeIds.indexOf("DEU")]).toBe(5e9);
  });

  it("ignores the withdrawn portfolio layer even if a snapshot still carries edges in it", () => {
    const stale: YearSnapshot = { ...yearData, portfolio_edges: [{ creditor: "USA", debtor: "DEU", amount: 7e9 }] };
    const net = buildExposureNetwork(stale);
    expect(net.exposure[net.nodeIds.indexOf("USA")][net.nodeIds.indexOf("DEU")]).toBe(5e9);
    expect(net.equity).toEqual(buildExposureNetwork(yearData).equity);
  });
});

describe("topExposureEdges", () => {
  const yearData: YearSnapshot = {
    nodes: [],
    edges: [
      { creditor: "USA", debtor: "DEU", amount: 5e9 },
      { creditor: "FRA", debtor: "DEU", amount: 9e9 },
    ],
    portfolio_edges: [{ creditor: "USA", debtor: "DEU", amount: 7e9 }],
  };

  it("lists the largest banking exposures first, and ignores the withdrawn layer", () => {
    expect(topExposureEdges(yearData, 10)).toEqual([
      { creditor: "FRA", debtor: "DEU", amount: 9e9 },
      { creditor: "USA", debtor: "DEU", amount: 5e9 },
    ]);
  });

  it("respects the limit", () => {
    expect(topExposureEdges(yearData, 1)).toEqual([{ creditor: "FRA", debtor: "DEU", amount: 9e9 }]);
  });

  it("matches the exposure matrix the model runs on", () => {
    const net = buildExposureNetwork(yearData);
    for (const e of topExposureEdges(yearData, 10)) {
      expect(net.exposure[net.nodeIds.indexOf(e.creditor)][net.nodeIds.indexOf(e.debtor)]).toBe(e.amount);
    }
  });

  it("does not mutate the snapshot", () => {
    topExposureEdges(yearData, 10);
    expect(yearData.edges[0].amount).toBe(5e9);
  });
});
