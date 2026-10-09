import { describe, expect, it } from "vitest";
import golden from "../../../model/debtrank_model/tests/golden/debtrank_cases.json";
import goldenEn from "../../../model/debtrank_model/tests/golden/eisenberg_noe_cases.json";
import { runDebtRank, type ExposureNetwork } from "./debtrank";
import { clearingVector } from "./eisenbergNoe";

// mulberry32: tiny seeded PRNG, no dependency
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

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

describe("TS Eisenberg-Noe matches Python golden cases", () => {
  goldenEn.forEach((c, k) => {
    it(`case ${k}`, () => {
      const r = clearingVector(c.nodeIds, c.liabilities, c.externalAssets);
      r.payments.forEach((v, i) => expect(v).toBeCloseTo(c.payments[i], 8));
      r.nominalLiabilities.forEach((v, i) => expect(v).toBeCloseTo(c.nominalLiabilities[i], 8));
    });
  });
});

describe("clearingVector properties (seeded)", () => {
  const network = (r: () => number) => {
    const n = 3 + Math.floor(r() * 6);
    const ids = Array.from({ length: n }, (_, i) => `N${i}`);
    const liabilities = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i !== j && r() < 0.5 ? r() * 100 : 0)),
    );
    const external = Array.from({ length: n }, () => r() * 60);
    return { ids, liabilities, external };
  };

  it("pays within [0, owed], is a fixed point, and never pays less when given more", () => {
    const r = rng(2);
    for (let k = 0; k < 50; k++) {
      const { ids, liabilities, external } = network(r);
      const { payments: p, nominalLiabilities: pBar } = clearingVector(ids, liabilities, external);
      p.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(-1e-12);
        expect(v).toBeLessThanOrEqual(pBar[i] + 1e-9);
        const incoming = liabilities.reduce((s, row, j) => s + (pBar[j] > 0 ? (row[i] / pBar[j]) * p[j] : 0), 0);
        expect(v).toBeCloseTo(Math.min(pBar[i], external[i] + incoming), 7);
      });
      const richer = clearingVector(
        ids,
        liabilities,
        external.map((e) => e + r() * 30),
      ).payments;
      richer.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(p[i] - 1e-8));
    }
  });
});
