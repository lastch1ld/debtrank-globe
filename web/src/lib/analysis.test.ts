import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBaselineShortfall, computeShockResult, runAnalysisAcrossYears, type ShockSpec } from "./analysis";
import type { ExposureNetwork } from "./debtrank";
import { buildExposureNetwork, countries } from "./network";

// Every year is served the same two-country snapshot, so any difference
// between the two runs below can only come from the portfolio channel.
const [a, b] = countries.slice(0, 2).map((c) => c.id);
const snapshot = {
  nodes: [
    { id: a, gdp_usd: 1e12, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
    { id: b, gdp_usd: 1e12, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
  ],
  edges: [{ creditor: b, debtor: a, amount: 1e10 }],
  portfolio_edges: [{ creditor: b, debtor: a, amount: 5e11 }],
};

afterEach(() => vi.unstubAllGlobals());

describe("runAnalysisAcrossYears", () => {
  it("builds each year's network on the channels the caller asked for", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(snapshot)));

    const shocks: ShockSpec[] = [{ id: a, magnitude: 0.5, delay: 0 }];
    const bankOnly = await runAnalysisAcrossYears(shocks, "debtrank");
    const withPortfolio = await runAnalysisAcrossYears(shocks, "debtrank", undefined, true);

    // The chart and the globe answer the same question; if the toggle were
    // dropped on the way here the two would be identical and the chart
    // would silently contradict the live view.
    expect(withPortfolio[0].modelImpact).toBeGreaterThan(bankOnly[0].modelImpact);
  });
});

describe("computeShockResult", () => {
  // Both models take the whole list; the delay only means something to
  // DebtRank, which is why the panel says so next to Eisenberg-Noe.
  it("shocks every country in the list under Eisenberg-Noe", async () => {
    const network = buildExposureNetwork(snapshot);
    const baseline = computeBaselineShortfall(network);

    const one = computeShockResult(network, [{ id: a, magnitude: 0.9, delay: 0 }], "eisenberg-noe", baseline);
    const both = computeShockResult(
      network,
      [{ id: a, magnitude: 0.9, delay: 0 }, { id: b, magnitude: 0.9, delay: 0 }],
      "eisenberg-noe",
      baseline,
    );
    const total = (r: typeof one) => (r.kind === "eisenberg-noe" ? r.aggregate : r.debtrank);
    expect(total(both)).toBeGreaterThanOrEqual(total(one));
  });
});

describe("computeShockResult netting", () => {
  // `a` owes `b` 100 but holds only 10: short at baseline with no shock at
  // all. That is a data-scale mismatch, not contagion, and must not show up.
  const stressed: ExposureNetwork = {
    nodeIds: [a, b],
    exposure: [
      [0, 0],
      [100, 0],
    ],
    equity: [10, 1000],
  };

  it("nets the baseline shortfall out of Eisenberg-Noe distress", () => {
    const baseline = computeBaselineShortfall(stressed);
    expect(baseline[0]).toBeCloseTo(0.9);

    const none = computeShockResult(stressed, [{ id: a, magnitude: 0, delay: 0 }], "eisenberg-noe", baseline);
    expect(none.kind === "eisenberg-noe" && none.distress[0]).toBe(0);

    const shocked = computeShockResult(stressed, [{ id: a, magnitude: 0.5, delay: 0 }], "eisenberg-noe", baseline);
    // Assets 10 -> 5, so the shortfall goes 0.90 -> 0.95; only the extra counts.
    expect(shocked.kind === "eisenberg-noe" && shocked.distress[0]).toBeCloseTo(0.05);
  });
});

describe("computeShockResult delays", () => {
  it("hands DebtRank each shock's delay, so a later shock lands in a later round", () => {
    const network = buildExposureNetwork(snapshot);
    const result = computeShockResult(
      network,
      [
        { id: a, magnitude: 0.5, delay: 0 },
        { id: b, magnitude: 0.8, delay: 2 },
      ],
      "debtrank",
      [],
    );
    if (result.kind !== "debtrank") throw new Error("expected a DebtRank result");
    const i = result.nodeIds.indexOf(b);
    // b only inherits a little distress from a's early shock, then its own
    // 0.8 arrives in round 2.
    expect(result.history[0][i]).toBe(0);
    expect(result.history[1][i]).toBeLessThan(0.8);
    expect(result.history[2][i]).toBeGreaterThanOrEqual(0.8);
  });
});

describe("runAnalysisAcrossYears without portfolio data", () => {
  // CPIS ends at 2023: the 2024-25 files carry an empty portfolio_edges
  // array, and older builds had no such key. Asking for the portfolio layer
  // must then change nothing rather than fail.
  it.each([
    ["an empty portfolio_edges array", { ...snapshot, portfolio_edges: [] }],
    ["no portfolio_edges key", { nodes: snapshot.nodes, edges: snapshot.edges }],
  ])("falls back to bank-only edges with %s", async (_label, noCpis) => {
    vi.resetModules(); // loadYearData caches per module, so start with an empty cache
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(noCpis)));
    const { runAnalysisAcrossYears: run } = await import("./analysis");

    const shocks: ShockSpec[] = [{ id: a, magnitude: 0.5, delay: 0 }];
    const bankOnly = await run(shocks, "debtrank");
    const withPortfolio = await run(shocks, "debtrank", undefined, true);

    expect(bankOnly[0].modelImpact).toBeGreaterThan(0);
    expect(withPortfolio.map((p) => p.modelImpact)).toEqual(bankOnly.map((p) => p.modelImpact));
  });
});
