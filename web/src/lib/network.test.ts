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
    portfolio_edges: [{ creditor: "USA", debtor: "DEU", amount: 7e9 }],
  };

  it("excludes portfolio edges by default", () => {
    const net = buildExposureNetwork(yearData);
    const i = net.nodeIds.indexOf("USA");
    const j = net.nodeIds.indexOf("DEU");
    expect(net.exposure[i][j]).toBe(5e9);
  });

  it("adds portfolio edges into the exposure matrix when included", () => {
    const net = buildExposureNetwork(yearData, { includePortfolio: true });
    const i = net.nodeIds.indexOf("USA");
    const j = net.nodeIds.indexOf("DEU");
    expect(net.exposure[i][j]).toBe(5e9 + 7e9);
  });

  it("does not let portfolio edges change equity, regardless of the toggle", () => {
    const withoutPortfolio = buildExposureNetwork(yearData);
    const withPortfolio = buildExposureNetwork(yearData, { includePortfolio: true });
    expect(withPortfolio.equity).toEqual(withoutPortfolio.equity);
  });
});

describe("topExposureEdges", () => {
  const yearData: YearSnapshot = {
    nodes: [],
    edges: [{ creditor: "USA", debtor: "DEU", amount: 5e9 }],
    portfolio_edges: [
      { creditor: "USA", debtor: "DEU", amount: 7e9 },
      { creditor: "FRA", debtor: "DEU", amount: 9e9 },
    ],
  };

  it("draws only the banking layer by default", () => {
    expect(topExposureEdges(yearData, 10)).toEqual([{ creditor: "USA", debtor: "DEU", amount: 5e9 }]);
  });

  it("sums the portfolio layer into a shared pair and adds portfolio-only pairs", () => {
    expect(topExposureEdges(yearData, 10, { includePortfolio: true })).toEqual([
      { creditor: "USA", debtor: "DEU", amount: 12e9 },
      { creditor: "FRA", debtor: "DEU", amount: 9e9 },
    ]);
  });

  it("matches the exposure matrix the model runs on", () => {
    const net = buildExposureNetwork(yearData, { includePortfolio: true });
    for (const e of topExposureEdges(yearData, 10, { includePortfolio: true })) {
      expect(net.exposure[net.nodeIds.indexOf(e.creditor)][net.nodeIds.indexOf(e.debtor)]).toBe(e.amount);
    }
  });

  it("does not mutate the snapshot", () => {
    topExposureEdges(yearData, 10, { includePortfolio: true });
    expect(yearData.edges[0].amount).toBe(5e9);
  });
});
