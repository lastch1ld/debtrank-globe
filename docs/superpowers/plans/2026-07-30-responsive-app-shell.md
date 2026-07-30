# Responsive App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the globe fully visible beside the desktop sidebar and prevent long simulation results from crushing or displacing controls.

**Architecture:** `App.tsx` will become a responsive two-region shell on desktop and retain an overlay drawer on mobile. The sidebar will separate non-shrinking controls from a flexible, independently scrolling ranked-results region.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, React Three Fiber, Vitest

## Global Constraints

- Preserve all simulation calculations, data loading, globe interaction, and shader values.
- Preserve the existing panel toggle semantics and keyboard focus treatment.
- Reserve exactly 380px for the open sidebar at the `sm` breakpoint and above.
- Keep mobile controls below the navbar in an overlay drawer.
- Do not introduce a new runtime dependency.

---

### Task 1: Responsive shell and bounded sidebar

**Files:**
- Create: `web/tests/responsiveShell.test.ts`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: existing `panelOpen`, `result`, `ranked`, and simulation handlers in `App`.
- Produces: responsive Tailwind layout contracts for the canvas, navbar, sidebar, controls region, and ranked list.

- [ ] **Step 1: Add the failing layout contract test**

Create `web/tests/responsiveShell.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf8");

describe("responsive application shell", () => {
  it("reserves desktop space for an open 380px sidebar", () => {
    expect(app).toContain('sm:right-[380px]');
    expect(app).toContain('sm:w-[380px]');
  });

  it("keeps the drawer below the mobile navbar", () => {
    expect(app).toContain("top-20");
    expect(app).toContain("sm:top-0");
  });

  it("keeps controls stable and gives ranked results their own scroll region", () => {
    expect(app).toContain('data-testid="sidebar-controls"');
    expect(app).toContain("shrink-0");
    expect(app).toContain('data-testid="ranked-results"');
    expect(app).toContain("overflow-y-auto");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the current layout fails**

Run:

```bash
cd web
npm test -- tests/responsiveShell.test.ts
```

Expected: FAIL because `App.tsx` does not reserve desktop canvas space, starts the panel behind the navbar, and has no bounded result region.

- [ ] **Step 3: Reflow the canvas and navbar on desktop**

In `App.tsx`, make both surfaces transition their right inset:

```tsx
<div
  className={`absolute inset-y-0 left-0 transition-[right] duration-300 ${
    panelOpen ? "right-0 sm:right-[380px]" : "right-0"
  }`}
>
```

```tsx
<nav
  className={`${glass} fixed left-4 top-4 z-20 ... transition-[right] duration-300 ${
    panelOpen ? "right-4 sm:right-[396px]" : "right-4"
  }`}
>
```

Hide the navbar toggle on desktop while the panel is open; the sidebar will own its close button.

- [ ] **Step 4: Place the panel below mobile navigation and add its own desktop top row**

Change the sidebar positioning to:

```tsx
<aside
  className={`fixed bottom-0 right-0 top-20 z-15 flex w-full min-h-0 flex-col ... sm:top-0 sm:w-[380px] ${
    panelOpen ? "translate-x-0" : "translate-x-full"
  }`}
>
```

Add a `shrink-0` sidebar title/close row that appears on desktop. Its close button must call `setPanelOpen(false)` and retain the existing focus treatment.

- [ ] **Step 5: Separate controls from ranked results**

Wrap the stable content in:

```tsx
<div data-testid="sidebar-controls" className="flex shrink-0 flex-col gap-5">
  {/* description and all interactive controls */}
</div>
```

Move the ordered ranked list outside that wrapper and render it in:

```tsx
<div data-testid="ranked-results" className="min-h-0 flex-1 overflow-y-auto pr-1">
  <ol className="m-0 flex list-none flex-col gap-2 p-0">
    {/* ranked rows */}
  </ol>
</div>
```

Keep result summary, market check, chart/action, and empty-state legend in the stable controls region. Render the scrolling results region only when `result` exists and `ranked.length > 0`.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
cd web
npm test -- tests/responsiveShell.test.ts
npm test
npm run lint
npm run build
```

Expected: focused test passes; all existing tests, lint, and build pass. The existing Vite chunk-size warning may remain.

- [ ] **Step 7: Commit the implementation**

```bash
git add web/tests/responsiveShell.test.ts web/src/App.tsx
git commit -m "fix: stabilize responsive globe layout"
```

- [ ] **Step 8: Publish and verify**

Push `feature/responsive-app-shell`, open a pull request against `master`, wait for CI, merge, and verify the GitHub Pages deployment at:

```text
https://lastch1ld.github.io/debtrank-globe/
```

Expected: the globe is fully visible beside the panel at desktop width, the sidebar begins below the mobile navbar, and a long ranked list scrolls without compressing the model tabs.
