# Observatory Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine DebtRank Globe’s visual hierarchy, responsiveness, motion, and control ergonomics without changing simulation behavior.

**Architecture:** Retain the existing React/Three.js composition. Improve the app shell and control rail through focused JSX class changes and a small global accessibility layer; preserve the atmosphere implementation and data pipeline.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, React Three Fiber, Three.js, Vitest

## Global Constraints

- Preserve the larger, fainter, gradual globe glow.
- Preserve all simulation algorithms and datasets.
- Add no dependencies and no additional continuous WebGL effects.
- Keep controls usable from 320px wide through desktop.

---

### Task 1: Observatory hierarchy

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: existing panel, control, and simulation state
- Produces: refined shell hierarchy, section dividers, selected states, and responsive spacing

- [ ] **Step 1: Add a failing structural regression check**

Add a source-level test asserting the sidebar keeps fixed controls separate from the independently scrolling ranking region and exposes a live simulation status.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/observatoryShell.test.ts`
Expected: FAIL because the live status contract is absent.

- [ ] **Step 3: Implement the refined hierarchy**

Add status semantics, clearer control group boundaries, compact mobile copy, and more deliberate selected/hover/focus states without changing handlers.

- [ ] **Step 4: Add global accessibility polish**

Implement reduced-motion handling, selection colors, and range-control consistency in `index.css`.

- [ ] **Step 5: Verify focused behavior**

Run: `npx vitest run src/components/observatoryShell.test.ts`
Expected: PASS.

### Task 2: Responsive and release verification

**Files:**
- Modify: `web/src/App.tsx`
- Test: `web/src/components/observatoryShell.test.ts`

**Interfaces:**
- Consumes: existing `panelOpen`, `ranked`, and analysis states
- Produces: overflow-safe rail and readable control/action layouts at narrow and wide breakpoints

- [ ] **Step 1: Refine responsive constraints**

Ensure the navbar terminates before the desktop rail, mobile controls retain minimum target size, and rankings alone consume remaining vertical space.

- [ ] **Step 2: Run complete verification**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all commands pass.

- [ ] **Step 3: Inspect the production build**

Capture desktop and mobile screenshots with the sidebar open and a long ranking list.

- [ ] **Step 4: Review the diff**

Confirm algorithms, datasets, globe shaders, and external interfaces remain unchanged.

