import { describe, expect, it } from "vitest";
import { spectralRadius } from "./stability";

describe("spectralRadius", () => {
  it("is the largest eigenvalue of a 2x2 matrix worked out by hand", () => {
    // trace 0.3, determinant -0.1: eigenvalues 0.5 and -0.2
    expect(
      spectralRadius([
        [0.2, 0.3],
        [0.4, 0.1],
      ]),
    ).toBeCloseTo(0.5, 9);
  });

  it("handles a pure cycle, which a plain power iteration would oscillate on", () => {
    expect(
      spectralRadius([
        [0, 1],
        [1, 0],
      ]),
    ).toBeCloseTo(1, 9);
    expect(
      spectralRadius([
        [0, 0.5],
        [0.5, 0],
      ]),
    ).toBeCloseTo(0.5, 9);
  });

  it("is 0 for a network with no exposure, and for one with no loops", () => {
    expect(
      spectralRadius([
        [0, 0],
        [0, 0],
      ]),
    ).toBe(0);
    // a chain A -> B -> C: nilpotent, so any distress runs out. Power
    // iteration only gets close here (see the note in stability.ts).
    expect(
      spectralRadius([
        [0, 0.9, 0],
        [0, 0, 0.9],
        [0, 0, 0],
      ]),
    ).toBeLessThan(0.01);
  });

  it("grows when the exposures grow", () => {
    const ring = (w: number) => [
      [0, w, 0],
      [0, 0, w],
      [w, 0, 0],
    ];
    expect(spectralRadius(ring(0.4))).toBeCloseTo(0.4, 9);
    expect(spectralRadius(ring(0.9))).toBeGreaterThan(
      spectralRadius(ring(0.4)),
    );
  });

  it("is not thrown off by an isolated node", () => {
    expect(
      spectralRadius([
        [0, 0.5, 0],
        [0.5, 0, 0],
        [0, 0, 0],
      ]),
    ).toBeCloseTo(0.5, 9);
  });
});
