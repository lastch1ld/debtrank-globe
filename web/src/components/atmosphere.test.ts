import { describe, expect, it } from "vitest";
import { ATMOSPHERE_LAYERS } from "./atmosphere";

describe("atmosphere layers", () => {
  it("uses a larger, fainter outer layer for gradual falloff", () => {
    const [inner, outer] = ATMOSPHERE_LAYERS;

    expect(outer.scale).toBeGreaterThan(inner.scale);
    expect(outer.scale - inner.scale).toBeGreaterThanOrEqual(0.06);
    expect(outer.intensity).toBeLessThan(inner.intensity);
    expect(outer.power).toBeLessThan(inner.power);
    expect(outer.opacity).toBeLessThan(inner.opacity);
  });

  it("keeps both layers restrained", () => {
    for (const layer of ATMOSPHERE_LAYERS) {
      expect(layer.intensity).toBeLessThanOrEqual(0.75);
      expect(layer.opacity).toBeLessThanOrEqual(0.45);
    }
  });
});
