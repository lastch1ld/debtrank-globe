# Test Strategy Plan: Unit + E2E (Playwright)

> **For agentic workers:** Work phase by phase, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Check items off as they ship and keep them for traceability.

**Goal:** Tests that catch real regressions in the model, the data and the UI, including the new phases in the companion plans. Tests that only check whether source code contains certain strings are replaced with tests that check behaviour.

**Companion plans:**

- `docs/plans/2026-09-23-data-model-granularity.md` (PR #24)
- `docs/plans/2026-09-23-automated-data-refresh.md` (PR #25)

Every phase in those plans ships with the tests defined here.

## Where things stand (checked 2026-09-23 on `master`)

| Layer | Tool | What exists | Gap |
| --- | --- | --- | --- |
| Python model | pytest (`model/debtrank_model/tests/`) | DebtRank, Eisenberg-Noe, network builder; toy examples from the original papers | No parity test against the TS port on real data |
| Data pipeline | pytest (`data-pipeline/tests/`) | fetch_bis, fetch_cpis, build_snapshot, refresh_worldbank | No test of the published JSON files themselves |
| Web logic | vitest (`web/src/lib/*.test.ts`) | debtrank, eisenbergNoe, network, analysis, scenarioUrl | `analysis.test.ts` has only 2 cases |
| Web UI | vitest (`web/tests/*.test.ts`) | **Checks that source files contain certain strings**, e.g. `expect(app).toContain("sm:w-[380px]")` | Checks how the code is written, not what it does. A rename breaks them while real bugs pass. No component tests at all |
| E2E | none | — | No Playwright, and nothing loads the built app in a browser |
| CI (`ci.yml`) | model, pipeline, web jobs | typecheck, vitest, build | `oxlint` (`npm run lint`) doesn't run in CI. Nothing runs against the built `dist/` |

---

## Phase 0: Sanity check (do this first)

- [x] **Re-check the table above against current `master`,** since test files may have been added since.
- [x] **Confirm the WebGL question before committing to it.** Can headless Chromium on a GitHub runner render the three.js globe (via SwiftShader or `--use-gl=angle`)? Run it once in CI. If it can't, the E2E layer asserts on DOM and URL state only, with no canvas checks. Decide that here, not halfway through Phase 3. *Result: it works. The first `e2e` job on a GitHub runner passed (about 1m40s).*
- [x] **Check that this plan's order matches the companion plans.** The Phase 9 tab shell and the Phase 1 coverage fix in the granularity plan change what the E2E flows and golden values must be. Decide whether tests land before those changes (to pin current behaviour) or together with them. *Result: Playwright landed before the tab shell and the coverage fix, to pin current behaviour.*
- [x] **Check the cost:** keep the full E2E suite under ~5 minutes in CI, or split it into a fast smoke set for every PR and a full set on a nightly run. *Result: 12 tests, about 2 minutes in CI and locally with one worker; no split needed yet.*
- [x] Write the result here (what changed, what was dropped) before starting Phase 1.

  **Result (2026-10-09):** the table above still holds, except `oxlint` now runs in CI (#30) and `analysis.ts` has more cases (#34). Parity and property tests landed in #36, data-file checks in #33. Playwright goes in before the granularity/tabs changes, to pin current behaviour. WebGL under SwiftShader works locally (`--use-gl=angle --use-angle=swiftshader`), but is slow: run 2 workers, not 8. Whether it holds on a GitHub runner is measured by the first CI run of the `e2e` job. Two corrections to the plan: the URL does not gain `shock=` live (only "Copy link" builds it), so the shock flow asserts on the ranking instead; and `vite preview` needs `--base /debtrank-globe/` because `vite.config.ts` only applies the Pages base to `build`.

## Phase 1: Unit-test gaps (fast, no new tooling)

- [x] **TS ↔ Python parity (golden files).** Add a small script that runs `debtrank-model` on 2–3 real year files for a fixed set of shocks and writes `model/debtrank_model/tests/golden/*.json` (per-node distress and the aggregate score). `network.test.ts` / `debtrank.test.ts` load the same files and assert the TS port matches within 1e-9. This replaces "the two builders are pinned separately" with one shared truth. Regenerating the golden files is a deliberate, reviewed step. *Done on seeded synthetic networks, not real year files, so it doesn't change when data is refreshed. DebtRank and Eisenberg-Noe, in `golden/*.json`.*
- [x] **Properties that must always hold** (on random small networks): *Done for DebtRank (range, zero shock, monotone, no-claims-row in #35) and Eisenberg-Noe (payments within [0, owed], a fixed point, monotone in outside assets), in Python and TS, with seeded loops and no new dependency.*
  - distress stays within [0, 1];
  - a zero shock gives zero distress;
  - distress never decreases as the shock grows;
  - a node with no claims row gets zero distress (the Phase 1 coverage finding, as a test);
  - Eisenberg-Noe payments never exceed nominal liabilities.
  Use `hypothesis` in Python. In TS, use a simple seeded loop, with no new dependency unless the loop gets complicated.
- [x] **`analysis.ts`:** *(#34)*
  - netting against the baseline shortfall;
  - several shocks with delays;
  - `includePortfolio` actually reaching `runAnalysisAcrossYears`;
  - years without CPIS data (2024–25).
- [x] **Tests for the published data files** (`web/public/data/network/*.json`), in the pipeline suite: *(#33, plus `pairs.json` staleness). Not done: the "every field in `docs/data-api.md` is present" check.*
  - the schema stays additive only (every field in `docs/data-api.md` is present);
  - edges reference only existing nodes;
  - `amount` is greater than 0;
  - no duplicate (creditor, debtor) pairs;
  - node ids are the same across all years.
  The refresh plan's tripwires reuse these checks.

## Phase 2: Component tests (replace the string-matching tests)

- [ ] Add `@testing-library/react` and `jsdom` (dev dependencies only) and set vitest's `environment` for component test files. *Not done: layout assertions need a real browser, and the e2e suite covers the panels. The ui kit is tested with `react-dom/server`. Revisit if a component needs isolated interaction tests.*
- [x] Rewrite each `web/tests/*.test.ts` as a behaviour test. For example, "the ranked results region can scroll on its own" checks the rendered DOM and the element with `data-testid="ranked-results"`, not the string `overflow-y-auto` in `App.tsx`. Delete each string-matching test once its replacement passes. *Partly: the two layout ones are replaced by e2e (#38). `pagesDeployment` and `styleArchitecture` stay, since they check config files, not behaviour.*
- [ ] Mock the `Globe` component in component tests; WebGL is covered in Phase 3.
- [ ] Cover the side panel: model toggle, shock-size slider, adding and removing a delayed shock, the portfolio toggle being disabled for 2024 and 2025, and the ranking drill-down text.

## Phase 3: E2E with Playwright

- [x] Add `@playwright/test` to `web/` and create `web/e2e/`. Run the tests against `vite preview` of the **production build**, served under the Pages base path, so base-path bugs get caught.
- [x] **Smoke flows (run on every PR),** in `web/e2e/smoke.e2e.ts`; they also replace the layout string-matching tests in `web/tests/observatoryShell` and `responsiveShell`:
  1. The app loads with no console errors, and the default year's data request returns 200.
  2. Pick a country, apply a shock: the ranking fills in, and the URL gets `shock=`.
  3. Open a copied scenario link (`?year=2010&shock=GRC:1.00,PRT:0.60@2&model=debtrank`): the same state is restored.
  4. Switch years: a new file loads, and the ranking changes.
  5. Mobile viewport (375×812): the drawer opens and closes, and nothing scrolls sideways (`scrollWidth <= innerWidth`).
- [ ] **Full flows (nightly, or when the matching feature ships):**
  - Eisenberg-Noe toggle
  - historical presets
  - the "view across years" chart
  - hide financial centers
  - Phase 9 tabs, including `view=` in the URL
  - the Phase 3 country panel and the Phase 4 pair view
  - Phase 10 projected years, drawn differently from real years
- [ ] **The globe:** if Phase 0 showed WebGL works, add one screenshot comparison with a generous tolerance, run in the Playwright Docker image so rendering is identical every time. Otherwise, assert on the data attributes the globe exposes (for example the number of drawn arcs), not on pixels.
- [ ] **Accessibility check** with `@axe-core/playwright` on the main view. Fail only on serious or critical problems, so it doesn't turn into noise.
- [x] Record traces and screenshots only when a test fails, and upload them as a CI artifact. *(`retain-on-failure`; the report is uploaded as an artifact.)*

## Phase 4: CI wiring

- [x] Add `npm run lint` (oxlint) to the `web` job. It exists but never runs in CI. *(#30)*
- [x] Add an `e2e` job that needs `web` to pass first, installs only Chromium (`npx playwright install --with-deps chromium`), and caches the browser (the cache arrived with the nightly run).
- [ ] Make `ci.yml` callable (`workflow_call`) so the refresh plan's rebuild job can run the same suite before it opens a data PR. This is the fix for "PRs opened with `GITHUB_TOKEN` don't trigger CI" (refresh plan, Phase 3).
- [x] Nightly run of the full E2E set against the **live** GitHub Pages URL. It catches deploy problems (base path, CORS, missing files) that a local preview can't. *(`.github/workflows/e2e-live.yml`: nightly and on demand, via `E2E_BASE_URL`; opens one `e2e-live-failed` issue on failure. It runs the same 12 tests as every PR, not a larger set, because there is no "full flows" set yet.)*

## Tests each companion phase must bring

| Companion phase | Must include |
| --- | --- |
| Granularity P1 (coverage) | Golden files regenerated, plus a test that "a node outside BIS reporting now has a claims row" and a "no double counting" pipeline test |
| Granularity P2 (consistency) | Unit test that marker size and arcs change with `includePortfolio` |
| Granularity P3/P4 (panels) | Component tests plus one E2E flow each |
| Granularity P7 (experiments) | Each Lab experiment needs one sanity-level test before it leaves Lab, e.g. the stability index is 0 for an empty network |
| Granularity P9 (tabs) | E2E: each tab loads, and `view=` survives a reload |
| Granularity P10 (outlook) | Unit test that projection maths reproduces a hand-calculated debt path. E2E: projected years are drawn differently |
| Refresh P2/P3 | Tests for the published data files (Phase 1 here) and the diff-report tripwires, tested against recorded fixtures |

## Out of scope

- Browsers other than Chromium, until someone reports a browser-specific bug.
- Load and performance testing.
