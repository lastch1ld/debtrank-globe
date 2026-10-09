import { describe, expect, it } from "vitest";
import { CAMERA_DISTANCE, RADIUS, SIDEBAR_WIDTH, fitScale, sidebarShift } from "./fitScale";

/** Half-extents the camera actually sees at the globe's distance. */
function visibleHalf(width: number, height: number, fovDeg = 45) {
  const halfHeight = Math.tan((fovDeg * Math.PI) / 360) * CAMERA_DISTANCE;
  return { halfHeight, halfWidth: halfHeight * (width / height) };
}

describe("fitScale", () => {
  const viewports: [string, number, number][] = [
    ["phone portrait", 375, 812],
    ["phone landscape", 812, 375],
    ["tablet", 768, 1024],
    ["laptop", 1440, 900],
    ["ultrawide", 3440, 1440],
    ["short and wide", 800, 450],
    ["square", 700, 700],
  ];

  for (const [name, w, h] of viewports) {
    it(`keeps the globe inside the frame on a ${name}`, () => {
      const scale = fitScale(w, h);
      const { halfHeight, halfWidth } = visibleHalf(w, h);
      // The atmosphere shell, the widest thing drawn on the planet.
      const outer = RADIUS * 1.14 * scale;
      expect(outer).toBeLessThan(halfWidth);
      expect(outer).toBeLessThan(halfHeight);
      // ...and it should still fill the frame, not sit there as a dot.
      expect(outer).toBeGreaterThan(Math.min(halfWidth, halfHeight) * 0.85);
    });
  }

  it("falls back to 1 for a zero-sized canvas", () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe("sidebarShift", () => {
  it("re-centres the scene when the desktop sidebar is open", () => {
    expect(sidebarShift(1440, true)).toBe(SIDEBAR_WIDTH / 2);
  });

  it("stays put when the sidebar is closed, or is a full-screen sheet", () => {
    expect(sidebarShift(1440, false)).toBe(0);
    expect(sidebarShift(375, true)).toBe(0);
  });

  it("leaves the globe inside the strip the open sidebar leaves behind", () => {
    for (const [w, h] of [[900, 900], [1280, 800], [1440, 900], [740, 380]]) {
      const shift = sidebarShift(w, true);
      const scale = fitScale(w - 2 * shift, h);
      const { halfHeight } = visibleHalf(w, h);
      // Half the *visible* strip, in world units (world-per-pixel is set by
      // the vertical fov alone, so it does not depend on the full width).
      const halfStrip = ((w - 2 * shift) / 2) * ((2 * halfHeight) / h);
      expect(RADIUS * 1.14 * scale).toBeLessThan(halfStrip);
    }
  });
});
