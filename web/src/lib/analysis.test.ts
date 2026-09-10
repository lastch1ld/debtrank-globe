import { afterEach, describe, expect, it, vi } from "vitest";
import { runAnalysisAcrossYears } from "./analysis";
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

    const bankOnly = await runAnalysisAcrossYears(a, 0.5, "debtrank");
    const withPortfolio = await runAnalysisAcrossYears(a, 0.5, "debtrank", undefined, true);

    // The chart and the globe answer the same question; if the toggle were
    // dropped on the way here the two would be identical and the chart
    // would silently contradict the live view.
    expect(withPortfolio[0].modelImpact).toBeGreaterThan(bankOnly[0].modelImpact);
  });
});
