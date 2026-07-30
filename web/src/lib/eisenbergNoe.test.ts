import { describe, expect, it } from "vitest";
import { clearingVector, shortfall } from "./eisenbergNoe";

// Same hand-solvable networks as model/debtrank_model/tests/test_eisenberg_noe.py

describe("clearingVector", () => {
  it("solvent node pays in full", () => {
    const liabilities = [
      [0, 100],
      [0, 0],
    ];
    const result = clearingVector(["X", "Y"], liabilities, [150, 0]);
    expect(result.payments[0]).toBeCloseTo(100);
    expect(result.payments[1]).toBeCloseTo(0);
  });

  it("insolvent node pays only available assets", () => {
    const liabilities = [
      [0, 100],
      [0, 0],
    ];
    const result = clearingVector(["X", "Y"], liabilities, [40, 0]);
    expect(result.payments[0]).toBeCloseTo(40);
    expect(result.payments[1]).toBeCloseTo(0);
    expect(shortfall(result)[0]).toBeCloseTo(60);
  });

  it("mutual offsetting liabilities both pay in full", () => {
    const liabilities = [
      [0, 100],
      [100, 0],
    ];
    const result = clearingVector(["X", "Y"], liabilities, [0, 0]);
    expect(result.payments[0]).toBeCloseTo(100);
    expect(result.payments[1]).toBeCloseTo(100);
  });

  it("three node cascade default", () => {
    const liabilities = [
      [0, 100, 0],
      [0, 0, 100],
      [0, 0, 0],
    ];
    const result = clearingVector(["A", "B", "C"], liabilities, [20, 90, 0]);
    expect(result.payments[0]).toBeCloseTo(20);
    expect(result.payments[1]).toBeCloseTo(100);
    expect(result.payments[2]).toBeCloseTo(0);
  });
});
