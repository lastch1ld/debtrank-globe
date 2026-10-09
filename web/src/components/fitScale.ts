/** Radius of the planet mesh, and the camera's resting distance from it. */
export const RADIUS = 2;
export const CAMERA_DISTANCE = 5;

// The atmosphere's outer shell reaches 1.14x the planet radius; a little more
// than that keeps the halo off the edge of the frame without shrinking the
// globe to a marble.
const MARGIN = 1.25;

/**
 * A perspective camera's `fov` is *vertical*, so at a fixed distance the
 * globe keeps its on-screen height and loses its width as the viewport gets
 * narrower -- on a phone in portrait the planet is wider than the frame and
 * the app renders as a black rectangle. Scaling the scene to the smaller of
 * the two visible half-extents makes it fit either way round.
 */
export function fitScale(width: number, height: number, fovDeg = 45): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const halfHeight = Math.tan((fovDeg * Math.PI) / 360) * CAMERA_DISTANCE;
  const halfWidth = halfHeight * (width / height);
  return Math.min(halfHeight, halfWidth) / (RADIUS * MARGIN);
}

/**
 * Width of the desktop controls sidebar, and the viewport width at which it
 * stops being a full-screen sheet and becomes one (Tailwind's `sm`).
 */
export const SIDEBAR_WIDTH = 380;
export const SIDEBAR_BREAKPOINT = 640;

/**
 * How far left the scene has to sit, in canvas pixels, for the globe to be
 * centred in the strip the open sidebar leaves rather than behind it. Zero
 * below `sm`, where the sidebar covers the whole viewport anyway and there
 * is no strip to centre in.
 *
 * Applied as a camera view offset rather than a canvas resize: the shell
 * tests record the decision that opening the sidebar must not relayout the
 * canvas, and a view offset costs no drawing-buffer reallocation.
 */
export function sidebarShift(width: number, sidebarOpen: boolean): number {
  if (!sidebarOpen || width < SIDEBAR_BREAKPOINT) return 0;
  return SIDEBAR_WIDTH / 2;
}
