import { describe, expect, it } from "vitest";
import golden from "../../../model/debtrank_model/tests/golden/debtrank_cases.json";
import { runDebtRank, type ExposureNetwork } from "./debtrank";

// The golden file is written by the Python reference model
// (model/debtrank_model/tests/make_golden.py); the TS port must match it.
describe("TS port matches Python golden cases", () => {
  golden.forEach((c, k) => {
    it(`case ${k}`, () => {
      const net: ExposureNetwork = { nodeIds: c.nodeIds, exposure: c.exposure, equity: c.equity };
      const r = runDebtRank(net, c.shocks as unknown as Record<string, { level: number; delay: number }>);
      r.finalDistress.forEach((v, i) => expect(v).toBeCloseTo(c.finalDistress[i], 9));
      expect(r.debtrank).toBeCloseTo(c.debtrank, 9);
    });
  });
});

describe("runDebtRank properties (seeded)", () => {
  // mulberry32: tiny seeded PRNG, no dependency
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it("stays in [0,1], is zero without a shock, and is monotone in shock size", () => {
    const r = rng(1);
    for (let k = 0; k < 50; k++) {
      const n = 3 + Math.floor(r() * 6);
      const net: ExposureNetwork = {
        nodeIds: Array.from({ length: n }, (_, i) => `N${i}`),
        exposure: Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => (i !== j && r() < 0.5 ? r() * 80 : 0)),
        ),
        equity: Array.from({ length: n }, () => 40 + r() * 80),
      };
      const id = net.nodeIds[Math.floor(r() * n)];
      expect(runDebtRank(net, {}).finalDistress.every((v) => v === 0)).toBe(true);
      const [lo, hi] = [0.05 + r() * 0.95, 0.05 + r() * 0.95].sort((a, b) => a - b);
      const a = runDebtRank(net, { [id]: lo }).finalDistress;
      const b = runDebtRank(net, { [id]: hi }).finalDistress;
      b.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(a[i] - 1e-12);
        expect(v).toBeLessThanOrEqual(1);
        expect(a[i]).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
