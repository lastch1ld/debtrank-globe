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
});
