import { afterEach, describe, expect, it, vi } from "vitest";
import { runAnalysisAcrossYears, type ShockSpec } from "./analysis";
import { countries } from "./network";

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
    const { buildExposureNetwork } = await import("./network");
    const { computeBaselineShortfall, computeShockResult } = await import("./analysis");
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
