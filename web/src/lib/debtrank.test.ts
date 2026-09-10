import { describe, expect, it } from "vitest";
import { runDebtRank, type ExposureNetwork } from "./debtrank";

// Same hand-derivable toy networks as model/debtrank_model/tests/test_debtrank.py
// -- kept in sync deliberately so the TS port can be checked against the same
// expected values as the Python reference implementation.

describe("runDebtRank", () => {
  it("no shock means no impact", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 50],
        [0, 0],
      ],
      equity: [100, 100],
    };
    const result = runDebtRank(net, {});
    expect(result.finalDistress).toEqual([0, 0]);
    expect(result.debtrank).toBeCloseTo(0);
  });

  it("isolated node only carries its own shock", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B", "C"],
      exposure: [
        [0, 50, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      equity: [100, 100, 100],
    };
    const result = runDebtRank(net, { C: 0.6 });
    expect(result.finalDistress[0]).toBeCloseTo(0);
    expect(result.finalDistress[1]).toBeCloseTo(0);
    expect(result.finalDistress[2]).toBeCloseTo(0.6);
  });

  it("two node one-way propagation", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [50, 0], // B is exposed to A for 50
      ],
      equity: [100, 100],
    };
    const result = runDebtRank(net, { A: 1.0 });
    expect(result.finalDistress[0]).toBeCloseTo(1.0);
    expect(result.finalDistress[1]).toBeCloseTo(0.5);
    expect(result.debtrank).toBeCloseTo(0.5 * 0.5);
  });

  it("exposure capped at full equity loss", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [500, 0],
      ],
      equity: [100, 100],
    };
    const result = runDebtRank(net, { A: 1.0 });
    expect(result.finalDistress[1]).toBeCloseTo(1.0);
  });

  it("partial shock scales linearly through one hop", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [50, 0],
      ],
      equity: [100, 100],
    };
    const result = runDebtRank(net, { A: 0.4 });
    expect(result.finalDistress[1]).toBeCloseTo(0.2);
  });

  it("inactive node distress stays frozen on reverberation", () => {
    // X and Y are reciprocally exposed, each for half of their own equity.
    // X is partially shocked (0.5); once X propagates to Y and goes
    // INACTIVE, Y's later propagation back to X must not add to X's h.
    const net: ExposureNetwork = {
      nodeIds: ["X", "Y"],
      exposure: [
        [0, 50], // X's claim on Y
        [50, 0], // Y's claim on X
      ],
      equity: [100, 100],
    };
    const result = runDebtRank(net, { X: 0.5 });
    expect(result.finalDistress[0]).toBeCloseTo(0.5);
    expect(result.finalDistress[1]).toBeCloseTo(0.25);
    expect(result.debtrank).toBeCloseTo(0.25 * 0.5);
  });
});

// Mirrors model/debtrank_model/tests/test_debtrank.py's TestSequentialShocks
// -- the two implementations are kept structurally identical, so the
// sequencing semantics are pinned on both sides against the same network.
describe("sequential shocks", () => {
  // A chain A -> B -> C: A holds a claim on B, B on C.
  const chain = (): ExposureNetwork => ({
    nodeIds: ["A", "B", "C"],
    exposure: [
      [0, 50, 0],
      [0, 0, 50],
      [0, 0, 0],
    ],
    equity: [100, 100, 100],
  });

  it("treats a bare number as an immediate shock", () => {
    expect(runDebtRank(chain(), { C: 1 }).debtrank).toBeCloseTo(
      runDebtRank(chain(), { C: { level: 1 } }).debtrank,
      12,
    );
  });

  it("lands a delayed shock in the round it names", () => {
    const result = runDebtRank(chain(), { C: 1, A: { level: 0.4, delay: 2 } });
    expect(result.history[0][0]).toBe(0);
    expect(result.history[2][0]).toBeCloseTo(0.4, 12);
  });

  it("still propagates a late shock through a node the first wave spent", () => {
    // B is knocked inactive by the wave from C. A second, exogenous shock
    // to B is new information, not recirculated distress, so it must still
    // reach A -- otherwise sequencing does nothing in the case it exists for.
    const firstWaveOnly = runDebtRank(chain(), { C: 1 });
    const sequenced = runDebtRank(chain(), { C: 1, B: { level: 1, delay: 2 } });
    expect(sequenced.finalDistress[0]).toBeGreaterThan(firstWaveOnly.finalDistress[0]);
  });

  it("never counts a shock as its own impact, whenever it arrives", () => {
    const isolated: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [0, 0],
      ],
      equity: [100, 100],
    };
    expect(runDebtRank(isolated, { A: 1 }).debtrank).toBeCloseTo(0, 12);
    expect(runDebtRank(isolated, { A: { level: 1, delay: 3 } }).debtrank).toBeCloseTo(0, 12);
  });
});
