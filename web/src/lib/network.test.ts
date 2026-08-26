import { describe, expect, it } from "vitest";
import { explainExposure } from "./network";
import type { ExposureNetwork } from "./debtrank";

describe("explainExposure", () => {
  it("reports direct exposure when it exists", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 40],
        [10, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(40);
    expect(explanation.owedToShocked).toBe(10);
    expect(explanation.viaPath).toBeNull();
  });

  it("falls back to the strongest one-hop intermediary when there's no direct link", () => {
    // A -> M -> B is the only chain; direct A<->B is zero.
    const net: ExposureNetwork = {
      nodeIds: ["A", "M", "B"],
      exposure: [
        [0, 30, 0],
        [0, 0, 20],
        [0, 0, 0],
      ],
      equity: [100, 100, 100],
      equitySource: ["reserves", "reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(0);
    expect(explanation.owedToShocked).toBe(0);
    expect(explanation.viaPath).toEqual(["M"]);
  });

  it("falls back to a two-hop chain when no direct or one-hop link exists", () => {
    // Only path from A to B is A -> M1 -> M2 -> B; no direct A<->B and no
    // single intermediary bridges them.
    const net: ExposureNetwork = {
      nodeIds: ["A", "M1", "M2", "B"],
      exposure: [
        [0, 25, 0, 0],
        [0, 0, 15, 0],
        [0, 0, 0, 5],
        [0, 0, 0, 0],
      ],
      equity: [100, 100, 100, 100],
      equitySource: ["reserves", "reserves", "reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.claimOnShocked).toBe(0);
    expect(explanation.owedToShocked).toBe(0);
    expect(explanation.viaPath).toEqual(["M1", "M2"]);
  });

  it("returns null viaPath when the nodes are entirely disconnected", () => {
    const net: ExposureNetwork = {
      nodeIds: ["A", "B"],
      exposure: [
        [0, 0],
        [0, 0],
      ],
      equity: [100, 100],
      equitySource: ["reserves", "reserves"],
    };
    const explanation = explainExposure(net, "A", "B");
    expect(explanation.viaPath).toBeNull();
  });
});
