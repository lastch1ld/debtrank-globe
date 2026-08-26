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
