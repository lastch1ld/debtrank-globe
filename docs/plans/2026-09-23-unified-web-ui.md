# Unified Web UI Plan (reusable across projects)

> **For agentic workers:** Work phase by phase, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Check items off as they ship and keep them for traceability.

**Goal:** One set of design tokens and a small component kit that:

- the whole debtrank-globe UI uses, including the three.js globe and the chart, not just the HTML;
- every new tab in the granularity plan is built from;
- can later be lifted out as a standalone package for other lastch1ld projects **without rewriting it**.

**Companion plans:**

- `docs/plans/2026-09-23-data-model-granularity.md` (PR #24). Its Phase 9 tab shell and all new panels are built on this kit.
- `docs/plans/2026-09-23-test-strategy.md` (PR #26). Its Phase 2 component tests cover this kit.
- `docs/plans/2026-09-23-automated-data-refresh.md` (PR #25). No direct dependency.

## Where things stand (checked 2026-09-23 on `responsive-sweep`, PR #23)

- **No tokens.** `web/src/index.css` is a single line, `@import "tailwindcss";`. The app uses Tailwind's default palette directly: slate for surfaces, sky and amber for accents.
- **Two ad-hoc shared class strings.** `App.tsx` has `focus` and `secondaryButton` (line ~78). 4 of the 9 `<button>`s use `secondaryButton`. The other 5 are styled inline, with different rounding (`rounded-xl` vs. `rounded-lg` vs. `rounded-md`) and different padding.
- **No component layer.** `web/src/components/` holds only `Globe` and `YearAnalysisChart`. Everything else is ~900 lines of inline Tailwind in `App.tsx`.
- **A second colour system, outside CSS.** The globe and the chart hard-code **19 distinct hex colours** (e.g. `#f59e0b`, `#38bdf8`, and `#d95926` / `#3987e5` in the chart). Some match Tailwind's shades, some don't. Changing the theme wouldn't reach the WebGL or chart layers.
- **The distress gradient** (`#fbbf24 → #ef4444`) is written out inline in `App.tsx`.

## Design principles

1. **Extract, don't invent.** Every token and component comes from a style that already exists in the app. This is a consolidation, not a redesign: no new palette, no new visual language, no features nobody asked for. Where two existing variants differ (e.g. `rounded-xl` vs. `rounded-lg` buttons), pick the one PR #23 settled on and list the choices in the PR.
2. **Tokens are CSS custom properties,** mapped into Tailwind v4 through `@theme`. The WebGL globe and the chart read the **same variables** at runtime (a small `token("--color-accent")` helper that calls `getComputedStyle`). One source of truth for all three rendering layers.
3. **Build only what a screen needs now.** A component exists because a screen needs it now, not because a UI kit "should have" it. For the next component, follow the rule of three: extract it once a third screen needs the same thing.
4. **Portable from day one, extracted later.** The kit lives in-repo, behind a clean boundary, until a **second project actually adopts it**. Publishing a package that has one user means versioning and release overhead with nothing to show for it.
5. **The kit has no app knowledge.** No imports from `web/src/lib/`, no DebtRank types, no data fetching. That rule is what makes it portable, so enforce it with a lint or import rule, not by convention.

## Where it lives

```
web/src/ui/                 # the kit; imports nothing from the app
  tokens.css                # :root custom properties + Tailwind @theme mapping
  token.ts                  # token("--x") -> resolved value, for WebGL/chart code
  Button.tsx  IconButton.tsx  SegmentedToggle.tsx  Switch.tsx  Slider.tsx
  Panel.tsx  Stat.tsx  Badge.tsx  Tabs.tsx  Tooltip.tsx  Drawer.tsx
  index.ts                  # the public surface: nothing is used unless exported here
```

Extraction path, when a second consumer shows up (Phase 5): move `web/src/ui/` to its own repo or an npm workspace, and publish as `@lastch1ld/ui` (GitHub Packages or npm). Consumers import `@lastch1ld/ui/tokens.css` and the components. Only the import paths change.

---

## Phase 0: Sanity check (do this first)

- [ ] **Wait for PR #23** (`responsive-sweep`), which just reworked the panel's type scale and layout. Base this work on what #23 merges, and redo the inventory above against it. Building on the pre-#23 styles would lock in what #23 just fixed.
- [ ] **Confirm reuse is real.** List which lastch1ld projects would actually use this kit and check their stack (React? Tailwind v4? three.js?). If none is React + Tailwind, keep principle 4 strict: tokens only are portable, components stay in-repo. Record the list here.
- [ ] **Check the component list against real need.** Every component in the tree above must be backed by at least one current screen, or a screen in granularity-plan Phases 3, 4, 9 or 10. Remove any that aren't.
- [ ] **Check colour contrast** of the existing palette (the `slate-400` text on the panel backgrounds, and the amber/red distress gradient) against WCAG AA before turning it into tokens. Tokens make whatever they hold permanent.
- [ ] **Line up with the companion plans:** the Phase 9 tab shell (PR #24) is built after Phase 3 of this plan, and the component tests in PR #26 Phase 2 target this kit's components rather than `App.tsx`.
- [ ] Write the result here (what changed, what was dropped) before starting Phase 1.

## Phase 1: Tokens (one source of truth)

- [ ] `web/src/ui/tokens.css`: CSS custom properties for the colours in use (surfaces, borders, text levels, accent, warning, and the distress scale), radii, spacing steps actually used, the type scale from PR #23, focus ring and motion durations. Map them into Tailwind with `@theme` so utilities like `bg-surface` and `text-muted` work.
- [ ] Replace the Tailwind palette classes in `App.tsx` with token utilities. **Visual output must not change.** Compare screenshots before and after (Playwright, once PR #26 Phase 3 lands; until then, manual screenshots attached to the PR).
- [ ] `web/src/ui/token.ts` plus unit tests. Change `Globe.tsx`, `atmosphere.ts` and `YearAnalysisChart.tsx` to read tokens instead of hex constants. Afterwards, grep for 6-digit hex values in `web/src/` outside `tokens.css`: the result should be zero, or each remaining one has a comment saying why.
- [ ] The distress gradient becomes a token pair, used by both the ranking bars and the globe markers.

## Phase 2: Primitives (from the styles that exist)

- [ ] `Button` (the `secondaryButton` variant plus the primary one used for the active state), `IconButton` (the 9-unit square buttons), and `SegmentedToggle` (the model switch, currently two `flex-1 rounded-lg` buttons).
- [ ] `Switch`, `Slider` and `Select` for the controls panel. Use native elements underneath (`<input type="range">`, `<select>`, a checkbox with `role="switch"`) so keyboard and screen-reader behaviour comes for free.
- [ ] `Panel`, `Stat` (the `font-mono tabular-nums` figures), `Badge` (the equity-source and "experimental" labels) and `Tooltip`.
- [ ] Move `App.tsx` onto these. It should shrink noticeably, with no visual change (same screenshot comparison as Phase 1).
- [ ] Accessibility built into the primitives, not added per screen: visible focus via the shared focus token, `aria-pressed` on toggles, labelled icon buttons, and working reduced-motion handling.

## Phase 3: Layout pieces for the tab plan

- [ ] `Tabs`: arrow keys move between tabs (roving tabindex), the correct ARIA roles, and a horizontally scrolling tab bar on phones. It's controlled from outside, so the app can sync it with `view=` in the URL.
- [ ] `Drawer`: the mobile side panel from PR #23, extracted.
- [ ] Gate: the Phase 9 tab shell (PR #24) starts only after this phase.

## Phase 4: Documentation and guardrails

- [ ] **A kit page instead of Storybook:** one dev-only route (`?kit`) that renders every component in every state. It uses no new tooling. Add Storybook only if the kit is extracted and outside consumers ask for it.
- [ ] An import rule: nothing in `web/src/ui/` may import from outside `web/src/ui/` (an oxlint or `no-restricted-imports` rule, run in CI per PR #26 Phase 4).
- [ ] Component tests for each primitive (PR #26 Phase 2 scope).
- [ ] A short `web/src/ui/README.md`: the token list, when to add a component (rule of three), and the "no app knowledge" rule.

## Phase 5: Extraction (only once a second project adopts it)

- [ ] Trigger: a second lastch1ld project wants the kit. Until then, this phase stays unchecked on purpose.
- [ ] Move `web/src/ui/` into its own repo (or a workspace package) as `@lastch1ld/ui`. Publish it to GitHub Packages, with the token read from an environment variable and a `.npmrc.template`, never a committed `.npmrc`.
- [ ] Theming per project: each consumer overrides the CSS custom properties in its own stylesheet. Components never hard-code values, which is exactly what Phase 1 guarantees.
- [ ] Versioning: semver. Any change to a token's name or a component's props is a major version. Add a changelog from the first release.
- [ ] debtrank-globe becomes the first consumer of the published package, which proves the extraction was clean.

## Out of scope

- A redesign of the app's look. This plan only consolidates the existing one.
- Light mode or theme switching. The app is dark-only today; the token layer makes this possible later, but nothing here builds it.
- Porting other projects onto the kit. That's each project's own decision after Phase 5.
