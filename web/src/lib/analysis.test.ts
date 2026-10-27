import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBaselineShortfall, computeShockResult, type ShockSpec } from "./analysis";
import type { ExposureNetwork } from "./debtrank";
import { buildExposureNetwork, countries } from "./network";

// Every year is served the same two-country snapshot.
const [a, b] = countries.slice(0, 2).map((c) => c.id);
const snapshot = {
  nodes: [
    { id: a, gdp_usd: 1e12, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
    { id: b, gdp_usd: 1e12, reserves_usd: 1e11, external_debt_usd: null, bank_capital_ratio_pct: null },
  ],
  edges: [{ creditor: b, debtor: a, amount: 1e10 }],
};

afterEach(() => vi.unstubAllGlobals());

describe("the withdrawn portfolio layer", () => {
  // The IMF CPIS layer was withdrawn (its terms require permission to reuse
  // the data). Published files keep an empty `portfolio_edges`, but nothing
  // may read the key: a snapshot that still carries edges in it, from an
  // old copy or a stale cache, must give the same answer as one without.
  it.each([
    ["edges in portfolio_edges", { ...snapshot, portfolio_edges: [{ creditor: b, debtor: a, amount: 5e11 }] }],
    ["an empty portfolio_edges", { ...snapshot, portfolio_edges: [] }],
  ])("is ignored: a snapshot with %s changes nothing", async (_label, withKey) => {
    const shocks: ShockSpec[] = [{ id: a, magnitude: 0.5, delay: 0 }];
    const impacts = async (served: unknown) => {
      vi.resetModules(); // loadYearData caches per module, so start with an empty cache
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(served)));
      const { runAnalysisAcrossYears: run } = await import("./analysis");
      return (await run(shocks, "debtrank")).map((p) => p.modelImpact);
    };

    const plain = await impacts(snapshot);
    expect(plain[0]).toBeGreaterThan(0);
    expect(await impacts(withKey)).toEqual(plain);
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
