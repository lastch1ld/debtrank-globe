# Data Quality & Model Fidelity Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement remaining tasks task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Completed tasks are checked and kept for context/traceability — do not re-do them.

**Goal:** Make the exposure network's node "equity" (loss-absorbing buffer) and edge data as faithful to real, current, per-country reality as the public data sources allow, so the propagation ranking reflects genuine systemic-risk signal rather than data-coverage artifacts.

**Architecture:** No change to the DebtRank/Eisenberg-Noe algorithms themselves (`model/debtrank_model/`, `web/src/lib/debtrank.ts`, `web/src/lib/eisenbergNoe.ts`). All work here is in the data pipeline (`data-pipeline/`) and the network-building/equity-estimation layer (`web/src/lib/network.ts`, mirrored in `model/debtrank_model/cli.py`).

**Tech Stack:** Python (data-pipeline, requests), TypeScript/Vite (web), World Bank Indicators API, BIS Locational Banking Statistics bulk export.

## Global Constraints

- Never lower a node's estimated equity relative to the previous fallback chain -- only add better sources or tighter floors above it.
- Every change to `equityFor()` must be mirrored in both `web/src/lib/network.ts` and `model/debtrank_model/cli.py`, and re-verified against both test suites.
- Regenerating snapshot data must not silently change edge counts (`build_snapshot.py`'s per-year edge counts are the tripwire) -- only node attribute values should move.

---

### Task 0 (done): Stop offshore financial centres from saturating the impact matrix

**Status:** Shipped — [commit 63fcede](https://github.com/lastch1ld/debtrank-globe/commit/63fcede)

- [x] Floor equity at 8% of a node's own gross cross-border exposure (Basel-style capital-adequacy proxy) instead of a flat $1e6 constant, in both TS and Python.
- [x] Add `web/src/lib/financialCenters.ts` (BIS-sourced list of cross-border financial centres) and an optional "hide financial centers" toggle on the ranking panel.

### Task 0b (done): Carry forward stale World Bank data instead of dropping to crude fallbacks

**Status:** Shipped — [commit e87b5c2](https://github.com/lastch1ld/debtrank-globe/commit/e87b5c2)

- [x] `build_snapshot.py --by-year` applies last-observation-carried-forward (capped at 3 years) for GDP/reserves/external-debt, fixing ~40 countries (including Hong Kong SAR) whose most recent year was null purely from World Bank's publication lag, not a real data void.
- [x] `fetch_worldbank.py`'s single-snapshot year-range upper bound is derived from today's date instead of a hardcoded constant.

### Task 0c (done): Use real per-country bank capital ratios

**Status:** Shipped — [commit 01c32ee](https://github.com/lastch1ld/debtrank-globe/commit/01c32ee)

- [x] Add World Bank `FB.BNK.CAPA.ZS` (Bank Capital to Assets Ratio, IMF Financial Soundness Indicators) to the pipeline.
- [x] Use each country's real ratio for the footprint floor instead of a flat 8% Basel assumption; keep the flat 8% only for jurisdictions with no data under any indicator (Isle of Man, Cayman, Bermuda).

---

### Task 1: Decide the fate of `external_debt_usd`

**Files:**
- Modify: `web/src/lib/network.ts`, `model/debtrank_model/cli.py`, OR `data-pipeline/fetch_worldbank.py`, `data-pipeline/build_snapshot.py`

**Interfaces:**
- Consumes: World Bank `DT.DOD.DECT.CD` (already fetched)
- Produces: either a new equity/exposure signal, or a smaller pipeline surface

`external_debt_usd` is fetched, stored in every snapshot, and carried through LOCF -- but nothing in `equityFor()`, the UI, or either DebtRank/Eisenberg-Noe implementation reads it. Coverage is ~121/217 countries for 2025 (the indicator is IDS-based and doesn't cover advanced economies by design, so partial coverage is expected, not a bug).

- [ ] **Step 1: Decide direction**

Either (a) find a real use for it -- e.g. as an additional exposure signal representing a sovereign's own external liabilities, distinct from the BIS bank-to-bank claims already modeled -- or (b) remove it from `INDICATORS`/`FILL_FIELDS`/the snapshot schema as unused surface area.

- [ ] **Step 2: Implement and verify**

If (a): thread it through `equityFor`/network construction with the same rigor as the other fields (mirrored TS+Python, tests updated). If (b): remove the field from both fetch scripts and regenerate snapshots; confirm `npx vitest run` and `pytest` still pass and no other code references it.

### Task 2: Smooth BIS confidential-cell edge flicker across years

**Files:**
- Modify: `data-pipeline/fetch_bis.py` (`extract_edges_by_year`), `data-pipeline/build_snapshot.py`

**Interfaces:**
- Consumes: BIS bulk CSV confidentiality-suppressed cells (marked `"NaN"`)
- Produces: more stable year-over-year edge presence in `out/edges_by_year.json`

BIS marks a cell confidential in some quarters and not others for the same country pair (e.g. a bilateral exposure large enough to identify a single bank). Today that makes an edge disappear entirely for that year, then reappear the next -- which can look like a real change in exposure when scrubbing the year slider, when it's actually a reporting-suppression artifact.

- [ ] **Step 1: Quantify the problem**

Count how many (creditor, debtor) pairs have at least one year of data but are missing in an interior year (i.e. present in year Y-1 and Y+1 but not Y) across `edges_by_year.json`.

- [ ] **Step 2: Apply the same LOCF discipline used for node data**

Carry forward the most recent prior year's edge amount (capped at ~2-3 years, matching BIS's typical quarterly reporting cadence) when an interior year is missing for a pair that has data on both sides. Do not fill leading/trailing gaps (a pair with no data yet, or that has genuinely stopped reporting, should stay absent).

- [ ] **Step 3: Verify**

Confirm total edge counts move sensibly (up, not wildly) per year, and spot-check a known confidential-adjacent pair (e.g. involving a small financial centre) before/after.

### Task 3: Decide how to handle WB-absent micro-jurisdictions (Jersey, Guernsey, ...)

**Files:**
- Modify: `data-pipeline/build_snapshot.py`, possibly `web/src/data/network_snapshot.json`

**Interfaces:**
- Consumes: BIS edges naming counterparty codes with no World Bank country-list match
- Produces: either new placeholder nodes, or documented, intentional exclusion

Jersey (JE) and Guernsey (GG) appear in BIS's cross-border financial centre classification (used by `financialCenters.ts`) but have no entry in the World Bank country list at all, so `build_snapshot.py`'s `iso3_with_node` filter silently drops every edge touching them. They can never appear as globe markers or ranking entries even though BIS reports real exposure for them.

- [ ] **Step 1: Decide direction**

Either (a) manually inject minimal node records for Crown Dependencies/similar WB-absent jurisdictions (lat/lng from another source, gdp/reserves null, relying entirely on the capital-ratio-of-footprint floor), or (b) leave them excluded and document it explicitly in `data-pipeline/README.md`'s caveats section (partially already true) plus remove their now-dead entries from `financialCenters.ts` if they can truly never appear as nodes.

- [ ] **Step 2: Implement and verify**

If (a): confirm the injected nodes flow through `buildExposureNetwork` correctly and their edges are no longer silently dropped in `build_snapshot.py`. If (b): confirm `FINANCIAL_CENTER_IDS` only lists codes that can actually appear in `countries`.

### Task 4: Code-split the Three.js/React Three Fiber bundle

**Files:**
- Modify: `web/src/App.tsx` (dynamic `import()` for `Globe`), `web/vite.config.ts` if needed

**Interfaces:**
- Consumes: existing `Canvas`/`Globe` mount in `App.tsx`
- Produces: a separate, lazily-loaded chunk for the 3D globe

The production build currently emits one 1.6MB (428KB gzipped) JS chunk (flagged by Vite's own build warning) because Three.js/React Three Fiber/drei are bundled with the rest of the app. Splitting the globe into a lazy `React.lazy`/dynamic-import boundary would let the control shell and initial paint load without waiting on the 3D engine.

- [ ] **Step 1: Add a lazy boundary** around `<Globe />`/`<Canvas>` with a lightweight loading state matching the existing "Loading {year}…" treatment.
- [ ] **Step 2: Verify** bundle output shows a separate chunk for the Three.js path, and `npm run build`/`npx vitest run` still pass.

### Task 5 (larger, needs a scoping decision before starting): Forward-looking risk projection

Not started -- flagging as an option since "prediction/projection" came up. This would be a materially different feature from everything above: instead of replaying/backtesting 2005-2025 history (what "View across years" already does), it would extrapolate GDP/reserves/exposure growth trends to project systemic-risk scores into future years beyond the observed data. This needs an explicit go-ahead and a design pass (what trend model, what uncertainty framing, how not to overstate confidence in extrapolated shocks) before any implementation -- deliberately not scoped into steps here.
