# Data Model Coverage & Granularity Plan

> **For agentic workers:** Work phase by phase, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Check items off as they ship and keep them for traceability.

**Goal:** Let every country in the network actually receive contagion. Split exposures along the dimensions that matter for *sovereign* debt. Then show per-country and per-relation detail that explains the ranking instead of asserting it.

**Why now:** A review on 2026-09-23 (against `web/public/data/network/2023.json`) found:

1. **Only 28 of 217 nodes can ever be distressed through the banking layer.** `fetch_bis.py` keeps only `L_POSITION=C` (claims *of reporting banks*), so every banking-edge creditor is a BIS reporter. DebtRank moves distress to a creditor through its own claims (`A[i,j] = W[i,j] / E[i]`). A node with no claims row has an all-zero row, so it can be shocked but never ranked. The portfolio layer raises this to 81 creditors, but only up to 2023.
2. **The loss and the buffer measure different things.** An edge is a claim held by a country's private *banks*, across all counterparty sectors. For most nodes, the equity it is divided by is the *central bank's* FX reserves.
3. **Neither layer is split for sovereign exposure.** BIS uses `L_CP_SECTOR=A` (government, banks and non-banks combined). CPIS uses `I_A_T_T_T_BP6_USD` (equity plus debt), and an equity loss is not a default loss.
4. **`external_debt_usd` is fetched but never used** by the model or the UI (null for 96 of 217 nodes in 2023).
5. **The globe ignores the portfolio layer.** `totalExposure` (marker size) and `topExposureEdges` (arcs) in `web/src/lib/network.ts` read only `edges`. Switching "Include portfolio investment" on changes the model but not the globe.

**Architecture:** The DebtRank and Eisenberg-Noe algorithms stay unchanged. The work sits in `data-pipeline/`, in the network-building layer (`web/src/lib/network.ts`, mirrored in `model/debtrank_model/network.py`), and in the UI (`web/src/App.tsx`, `web/src/components/Globe.tsx`).

## Global Constraints

- **Schema changes are additive only** (see `docs/data-api.md` "Stability"). New fields or edge lists are fine. Renaming or removing `nodes` / `edges` / `portfolio_edges` fields is not. Update `docs/data-api.md` in the same change as any schema addition.
- **The TS and Python network builders must stay in lockstep.** Any change to how the exposure matrix or equity is built goes into both `web/src/lib/network.ts` and `model/debtrank_model/network.py`, and is pinned by `model/debtrank_model/tests/test_network.py` plus `web/src/lib/network.test.ts`.
- **Edge-count changes must be intentional.** The per-year edge counts printed by `build_snapshot.py` are the tripwire. Phase 1 changes them on purpose, so record the before and after counts in the PR.
- **`refresh_worldbank.py` must keep working.** It rewrites only node indicator fields and must never touch new edge lists.
- **A new data layer gets a toggle, and a toggle's effect must be visible.** If a layer changes the model, it also changes what the globe draws (see Phase 2).

---

## Phase 1: Coverage (every country can receive distress)

Highest impact. It changes the ranking for most shocks, so ship it on its own before anything else.

- [ ] In `fetch_bis.py`, also pull `L_POSITION=L` (liabilities of reporting banks to each counterparty country). Keep every other `WANTED` filter the same. Write the result as a separate raw output. Do not merge it into the claims file.
- [ ] Derive **reverse edges**: a reporter R's liabilities to a counterparty X become the edge `creditor=X, debtor=R`. **Only add a reverse edge when X is not a BIS reporter.** When X reports, its own `C` series already covers that pair, and adding both would double-count.
- [ ] Decide the schema: either a new `liability_edges` list (additive, shape matches `edges`) or a `source` field on `edges`. **Recommended: a separate list.** It keeps `edges` byte-identical for existing consumers and lets it get its own toggle.
- [ ] Add those edges to the exposure matrix in both builders (off by default, like the portfolio layer). Decide deliberately whether they count toward `gross_footprint`. The default is no, to match the portfolio precedent, so a node's buffer doesn't move when a toggle flips.
- [ ] Tests: add a pipeline test for the "reporter already covers this pair" rule, a matching `test_network.py` and `network.test.ts` case, and a check that a non-reporter node now has a non-zero row.
- [ ] Regenerate the 2005–2025 snapshots and note the per-year edge and creditor counts, before and after, in the PR.
- [ ] Caveat for `docs/data-api.md`: this counterparty-side data is mostly deposits placed by non-reporting countries' residents. It is a real exposure, but not the same instrument mix as reporter claims.

## Phase 2: Consistency fixes (small, independent)

- [ ] `totalExposure` and `topExposureEdges` take the same `includePortfolio` flag (and later the Phase 1 flag) as `buildExposureNetwork`, so marker sizes and arcs match the network the model runs on.
- [ ] In the ranking drill-down (`explainExposure` → `App.tsx`), show the **impact ratio** `exposure[i][j] / equity[i]` (capped at 100%) next to the dollar claim. That ratio is what DebtRank actually uses. The same dollar amount means very different things to Malta and to the US.

## Phase 3: Per-country panel (uses data already in the snapshot)

No pipeline work. Everything below is already in each year's JSON or can be derived from the built network.

- [ ] A country detail panel, opened by clicking a country on the globe or a name in the ranking:
  - GDP, reserves, external debt, and the ratios **external debt / GDP** and **reserves / external debt**. This finally uses `external_debt_usd`. Show "not reported" for nulls, never 0.
  - The **equity the model uses** and its source (reserves, GDP estimate, capital-ratio estimate or floor). Reuse the existing `equitySource` labels.
  - **Top 5 creditors and top 5 debtors**, each with its share of the total, split by layer (banking vs. portfolio).
  - Totals: claims vs. liabilities, and the number of counterparties.
- [ ] Mobile layout: the panel must fit the app shell from `responsive-sweep` without horizontal scroll.

## Phase 4: Relation detail

- [ ] Clicking an arc or a drill-down row opens a pair view for A↔B:
  - Both directions (A's claim on B and B's claim on A) for each layer, including the Phase 1 layer.
  - The impact ratio in each direction.
  - A **2005–2025 sparkline** of the pair's exposure.
- [ ] The sparkline needs every year's file (~16 MB in total), so don't fetch them all on click. **Recommended:** the pipeline emits a small per-pair history index (`data/network/pairs.json`, limited to pairs above a size threshold) as an additive artifact. The fallback is lazily loading only the years already in `yearCache`, but that leaves gaps.

## Phase 5: Sovereign-specific granularity

This is what makes the tool about *sovereign* debt rather than cross-border banking in general.

- [ ] **BIS counterparty-sector split:** also fetch `L_CP_SECTOR=G` (general government). Store it as an additive `amount_gov` on edges, or as a separate list. Confirm first that coverage in the public LBS file is good enough. Many reporter/counterparty pairs don't publish the sector breakdown, so measure how much would be null before designing the UI around it.
- [ ] Add a model option "claims on government only" so the shock follows the sovereign channel and not total banking claims.
- [ ] **CPIS debt-only:** switch to (or add) the debt-securities indicator instead of `I_A_T_T_T_BP6_USD` (total). *Verify the exact indicator code against DBnomics before implementing. It is not confirmed here.* Keep the total as a separate field if equity holdings should still be shown.
- [ ] Show the sector and instrument split in the Phase 3 and Phase 4 panels ("of which: claims on the government").

## Phase 6: Loss vs. buffer mismatch (decision needed)

Bank-system claims are measured against central-bank reserves (problem 2 above). Pick one approach and record the choice here before starting:

- [ ] **Option A (cheap, honest):** relabel the output as a *stress index*, not a solvency or default probability, in the UI, the README and `model/README.md`. The algorithms and data stay unchanged.
- [ ] **Option B (more faithful):** build the buffer for the banking layer from banking-system capital (capital-to-assets ratio × banking-system assets) and keep reserves only for the sovereign channel from Phase 5. This needs a banking-system assets source and has to go into both builders. It will move rankings for every year.

---

## Out of scope

- Calibrating the historical scenario presets to real losses (tracked separately in `ROADMAP.md`).
- Any change to the DebtRank or Eisenberg-Noe algorithms themselves.
