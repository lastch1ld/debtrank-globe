# Tailwind and Atmosphere Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Debtrank web interface in Tailwind CSS v4 with the approved Premium Observatory finish and replace the globe’s strong single rim with a larger, fainter two-layer atmosphere.

**Architecture:** Tailwind’s official Vite plugin will compile utility classes used directly in the existing React components; `index.css` will contain only the Tailwind import and `App.css` will be deleted. A small pure-data atmosphere configuration will define two Fresnel layers, while `Globe.tsx` will render both shells through one parameterized shader material.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS v4, React Three Fiber, Drei, Three.js, Vitest

## Global Constraints

- Preserve the current full-screen globe layout, simulation behavior, data flow, and scientific character.
- Use Tailwind CSS v4 utilities directly in JSX for authored interface styling.
- `web/src/index.css` must contain only `@import "tailwindcss";`.
- Remove `web/src/App.css` and its import.
- Do not add post-processing bloom.
- Do not change simulation models, financial calculations, data loading, or control behavior.
- Preserve accessible labels, expanded state, focus visibility, disabled states, panel scrolling, and mobile usability.
- Keep the globe dominant; cyan is reserved for focus, active state, and data emphasis.

---

### Task 1: Tailwind v4 setup and utility-only interface

**Files:**
- Create: `web/src/styleArchitecture.test.ts`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/vite.config.ts`
- Modify: `web/src/index.css`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/YearAnalysisChart.tsx`
- Delete: `web/src/App.css`

**Interfaces:**
- Consumes: Existing `App` state and handlers, `YearAnalysisChart({ points }: { points: YearPoint[] })`, and Vite’s current React plugin.
- Produces: A Vite build configured with `tailwindcss()`; an interface styled entirely through JSX utilities; the existing `App` and `YearAnalysisChart` exports unchanged.

- [ ] **Step 1: Add the failing style-architecture test**

Create `web/src/styleArchitecture.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Tailwind style architecture", () => {
  it("uses the Tailwind Vite plugin and import-only global stylesheet", () => {
    expect(read("vite.config.ts")).toContain('@tailwindcss/vite');
    expect(read("vite.config.ts")).toContain("tailwindcss()");
    expect(read("src/index.css").trim()).toBe('@import "tailwindcss";');
  });

  it("does not retain the legacy application stylesheet", () => {
    expect(existsSync(resolve(root, "src/App.css"))).toBe(false);
    expect(read("src/App.tsx")).not.toContain('./App.css');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run:

```bash
cd web
npx vitest run src/styleArchitecture.test.ts
```

Expected: FAIL because `vite.config.ts` has no Tailwind plugin, `index.css` contains legacy global rules, and `App.css` still exists.

- [ ] **Step 3: Install and configure Tailwind v4**

Run:

```bash
cd web
npm install tailwindcss @tailwindcss/vite
```

Update `web/vite.config.ts` to preserve React and add the official Tailwind plugin:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

Add the repository’s documented test command to `web/package.json`:

```json
"test": "vitest run"
```

Replace `web/src/index.css` with exactly:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Replace the application shell and panel CSS with Premium Observatory utilities**

Remove `import "./App.css";` from `App.tsx`. Replace legacy semantic class names with Tailwind v4 utilities while leaving all handlers, values, conditional branches, text, and ARIA attributes unchanged.

Use these visual tokens directly in utilities:

```tsx
const shell = "relative h-dvh w-screen overflow-hidden bg-[#02050c] text-slate-400 antialiased";
const glass =
  "border border-sky-200/10 bg-[linear-gradient(145deg,rgba(10,23,39,0.88),rgba(3,9,18,0.78))] shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl";
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";
const range =
  "h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-400/15 outline-none [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)]";
```

Apply the approved layout:

- root: `relative h-dvh w-screen overflow-hidden`;
- globe: absolute full inset;
- nav: fixed 16px inset on desktop, compact glass bar with a cyan wordmark accent;
- menu: accessible 36px square control with Tailwind `aria-expanded` variants for the three bars;
- panel: fixed right edge, `w-full sm:w-[380px]`, independently scrollable, with 96px top padding and a translate transition;
- panel cards/controls: fine sky-tinted borders, layered blue-black surfaces, 12–18px radii, compact spacing;
- active model: low-opacity cyan surface and bright text;
- results: retain the ranked grid and dynamic inline `transform` used for bar magnitude;
- animation: use Tailwind’s built-in `animate-[...]` only if the keyframes are available without authored CSS; otherwise use transition-only entry styling and omit the decorative rise animation.

Do not add a Tailwind configuration file or `@theme` block; the requirement is an import-only global stylesheet.

- [ ] **Step 5: Convert chart presentation to Tailwind utilities**

In `YearAnalysisChart.tsx`, replace every legacy class with utilities:

```tsx
<div className="relative rounded-xl border border-sky-200/10 bg-slate-950/25 px-3 pb-2 pt-3">
```

Use presentation attributes for SVG-only values that are already dynamic or are more reliable as SVG attributes:

```tsx
<text fontSize={8.5} letterSpacing="0.04em" ... />
<line stroke="rgba(148, 163, 184, 0.14)" strokeWidth={1} ... />
```

Use Tailwind for HTML layout, typography, color, border, tooltip, and x-axis labels. Keep `SERIES`, scales, paths, pointer handling, and tooltip values unchanged.

- [ ] **Step 6: Delete the legacy stylesheet and run the focused test**

Delete `web/src/App.css`, then run:

```bash
cd web
npx vitest run src/styleArchitecture.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run frontend checks**

Run:

```bash
cd web
npm test
npm run lint
npm run build
```

Expected: all existing model tests and the architecture test pass; lint and TypeScript/Vite production build exit 0.

- [ ] **Step 8: Review and commit the Tailwind slice**

Inspect:

```bash
git diff --check
git diff -- web/package.json web/package-lock.json web/vite.config.ts web/src/index.css web/src/App.tsx web/src/components/YearAnalysisChart.tsx web/src/styleArchitecture.test.ts
git status --short
```

Commit only Task 1 files:

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/src/index.css web/src/App.tsx web/src/components/YearAnalysisChart.tsx web/src/styleArchitecture.test.ts web/src/App.css
git commit -m "refactor: migrate interface styles to Tailwind"
```

---

### Task 2: Two-layer gradual globe atmosphere

**Files:**
- Create: `web/src/components/atmosphere.ts`
- Create: `web/src/components/atmosphere.test.ts`
- Modify: `web/src/components/Globe.tsx`

**Interfaces:**
- Consumes: `RADIUS` in `Globe.tsx`, Drei `shaderMaterial`, React Three Fiber `extend`, and Three.js additive blending/back-side rendering.
- Produces: `ATMOSPHERE_LAYERS`, a readonly tuple of `AtmosphereLayer` objects used by `Globe`; the public `GlobeProps` contract remains unchanged.

- [ ] **Step 1: Add a failing atmosphere-contract test**

Create `web/src/components/atmosphere.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run:

```bash
cd web
npx vitest run src/components/atmosphere.test.ts
```

Expected: FAIL because `./atmosphere` does not exist.

- [ ] **Step 3: Add the pure atmosphere configuration**

Create `web/src/components/atmosphere.ts`:

```ts
export interface AtmosphereLayer {
  readonly scale: number;
  readonly intensity: number;
  readonly opacity: number;
  readonly bias: number;
  readonly power: number;
}

export const ATMOSPHERE_LAYERS = [
  { scale: 1.055, intensity: 0.68, opacity: 0.38, bias: 0.72, power: 3.2 },
  { scale: 1.14, intensity: 0.22, opacity: 0.16, bias: 0.58, power: 1.65 },
] as const satisfies readonly AtmosphereLayer[];
```

- [ ] **Step 4: Parameterize the Fresnel shader**

In `Globe.tsx`, import `ATMOSPHERE_LAYERS`. Change the atmosphere material uniforms from:

```ts
{ glowColor: new Color("#38bdf8"), intensity: 1.1 }
```

to:

```ts
{
  glowColor: new Color("#38bdf8"),
  intensity: 0.68,
  opacity: 0.38,
  fresnelBias: 0.72,
  fresnelPower: 3.2,
}
```

Update the vertex shader:

```glsl
uniform float fresnelBias;
uniform float fresnelPower;
varying float vIntensity;

void main() {
  vec3 vNormal = normalize(normalMatrix * normal);
  vec3 viewDir = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
  float rim = max(fresnelBias - dot(vNormal, -viewDir), 0.0);
  vIntensity = pow(rim, fresnelPower);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

Update the fragment shader:

```glsl
uniform vec3 glowColor;
uniform float intensity;
uniform float opacity;
varying float vIntensity;

void main() {
  float alpha = clamp(vIntensity * intensity * opacity, 0.0, opacity);
  gl_FragColor = vec4(glowColor, alpha);
}
```

- [ ] **Step 5: Render both atmosphere shells**

Replace the single atmosphere sphere with:

```tsx
{ATMOSPHERE_LAYERS.map((layer, index) => (
  <Sphere key={index} args={[RADIUS * layer.scale, 64, 64]}>
    <atmosphereMaterial
      glowColor={new Color("#38bdf8")}
      intensity={layer.intensity}
      opacity={layer.opacity}
      fresnelBias={layer.bias}
      fresnelPower={layer.power}
      side={BackSide}
      transparent
      blending={AdditiveBlending}
      depthWrite={false}
      toneMapped={false}
    />
  </Sphere>
))}
```

Keep the globe surface, borders, arcs, markers, lights, and camera settings unchanged.

- [ ] **Step 6: Run focused and broad checks**

Run:

```bash
cd web
npx vitest run src/components/atmosphere.test.ts
npm test
npm run lint
npm run build
```

Expected: atmosphere contract and existing model tests pass; lint and production build exit 0.

- [ ] **Step 7: Review and commit the atmosphere slice**

Inspect:

```bash
git diff --check
git diff -- web/src/components/atmosphere.ts web/src/components/atmosphere.test.ts web/src/components/Globe.tsx
```

Commit:

```bash
git add web/src/components/atmosphere.ts web/src/components/atmosphere.test.ts web/src/components/Globe.tsx
git commit -m "feat: soften globe atmosphere"
```

---

### Task 3: Integrated verification and handoff

**Files:**
- Verify: `web/src/App.tsx`
- Verify: `web/src/components/YearAnalysisChart.tsx`
- Verify: `web/src/components/Globe.tsx`
- Verify: `web/src/index.css`
- Verify: `web/package.json`

**Interfaces:**
- Consumes: Completed Tailwind UI and two-layer atmosphere.
- Produces: Fresh evidence that the integrated web application meets the approved specification.

- [ ] **Step 1: Verify style-architecture invariants**

Run:

```bash
test "$(tr -d '\r' < web/src/index.css)" = '@import "tailwindcss";'
test ! -e web/src/App.css
! rg -n 'App\.css|className="(app|panel|navbar|analysis-chart)' web/src
```

Expected: all commands exit 0 and no legacy class/import match is printed.

- [ ] **Step 2: Run the full web verification suite**

Run:

```bash
cd web
npm test
npm run lint
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect production output**

Run:

```bash
test -f web/dist/index.html
test -d web/dist/assets
du -sh web/dist
```

Expected: the production HTML and asset directory exist and the output size is reported.

- [ ] **Step 4: Perform the available visual check**

Start:

```bash
cd web
npm run dev -- --host 0.0.0.0
```

In an available preview surface, check:

- closed and open panel states at desktop width;
- full-width panel at less than 640px;
- menu, model toggle, select, reset, both sliders, chart toggle, and ranked results;
- keyboard focus rings and disabled states;
- an unshocked globe and a shocked-country state;
- inner atmosphere remains defined while the outer glow is visibly larger and fainter;
- markers, arcs, and borders do not acquire a global bloom.

If the environment cannot expose a browser preview, record that limitation and hand the exact visual checklist to the user rather than claiming visual verification.

- [ ] **Step 5: Inspect final repository state**

Run:

```bash
git status --short --branch
git log -5 --oneline
git diff origin/master...HEAD --check
git diff --stat origin/master...HEAD
```

Expected: only the approved spec, plan, Tailwind migration, atmosphere implementation, tests, and lockfile changes are committed; generated visual-companion files are not included.
