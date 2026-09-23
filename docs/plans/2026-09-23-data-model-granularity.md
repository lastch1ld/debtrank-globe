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

## Phase 7: Alternative modelling (exploratory)

These are ideas, not commitments. Each item is a small experiment. Keep it only if the result says something. The literature references are from memory, so verify them before citing any of them in the UI or README.

**Cheap to try, high signal (no new data):**

- [ ] **Stability index over time.** Plot the largest eigenvalue (spectral radius) of `impact_matrix()` for each year, 2005–2025. Theory for linearised DebtRank says distress dies out below 1 and amplifies above 1 (Bardoscia et al., 2017, "Pathways towards instability"). Check whether the series climbs before 2008 and 2010.
- [ ] **Importance vs. vulnerability.** Run a unit shock for every country, for every year. For each country, record how much it hurts others when it is shocked (systemic importance) and its average distress across all the other countries' shocks (vulnerability). Show both as a scatter plot animated across years. Precompute this in the pipeline if it's too slow in the browser.
- [ ] **Backtest against markets.** For the 2010–12 euro crisis, compute the rank correlation between the ranking from a GRC shock and how much each country's bond spreads actually widened (`web/src/data/market_data.json`). Publish the result either way. A null result is still a finding.
- [ ] **Uncertainty ranges.** Resample each estimated buffer (any `equitySource` other than `reserves`) within a plausible range and rerun a few hundred times. Show each country's rank as a range (for example "rank 3–9") instead of a single number.

**New contagion channels:**

- [ ] **Overlapping holdings / fire sales.** Use the CPIS holdings to find countries that hold the same issuers' debt. When a holder is forced to sell, prices fall for every other holder of the same bonds (Greenwood, Landier & Thesmar; Cont & Schaanning). This captures contagion between countries with no direct link. It's the biggest modelling upgrade for *sovereign* debt, so decide whether it becomes a full phase.
- [ ] **Funding withdrawal (sudden stop).** Add propagation in the opposite direction: a distressed creditor cuts lending, so the countries it funds lose funding in proportion to that creditor's share of their external funding (Gai, Haldane & Kapadia). Examples: emerging Europe in 2008, Asia in 1997. This needs to be mirrored in the TS and Python models, with tests.
- [ ] **Global currency shocks.** Use the BIS currency breakdown (`L_DENOM`: USD, EUR, ...) to support scenarios such as "USD rises 15%", which hit every country's dollar-denominated debt at once instead of shocking one country.

**Filling in the data:**

- [ ] **Estimate missing bilateral links.** Where a country's total claims and liabilities are known but the bilateral breakdown isn't, estimate the most consistent links with RAS / maximum entropy or the fitness model (Cimini et al., 2015). Keep the result as a separate, clearly labelled *estimated* layer that is off by default. This builds on Phase 1.
- [ ] **Quarterly data.** Keep every BIS quarter instead of only the latest quarter per year, so the 2008 and 2020 shocks can be followed within the year. Check the impact on file size first (the yearly files already total ~16 MB).

**Suggested order:** the stability index and importance vs. vulnerability first (a few hours each, no new data), then the backtest. Fire sales is the long-term priority.

## Phase 8: worlddata integration (alternative views)

Source: the sibling repo [lastch1ld/worlddata](https://github.com/lastch1ld/worlddata). These are its datasets that can be joined to this repo by country and year:

| Dataset | Countries | Key | Range |
| --- | --- | --- | --- |
| `uncertainty_world` (World Uncertainty Index) | 144 | ISO3 | 1952 to Oct 2024 |
| `geopolitical_risk` (Geopolitical Risk index) | 45 | ISO3 | to Aug 2026 |
| `central_bank_rates` / `policy_changes` | 49 | ISO2 | to Aug 2026 |
| `gdp_by_country` / `inflation_by_country` | ~200 | country name | to 2023 |
| `elections`, `georisk_events`, `fed_communications` | dated events | name / global | varies |
| `market_drivers`, `vix_daily`, `us_10y_yield_monthly` | global | — | varies |

**Constraints:**

- worlddata's **data is not MIT** (see its `LICENSE`). Its Wikipedia-derived sets (`elections`, `political_events`) are **CC BY-SA**, which requires derived work to carry the same licence. Only copy permissively licensed sets into this repo, and credit each one in `docs/data-api.md`.
- The integration is a **pipeline step** (e.g. `data-pipeline/fetch_worlddata.py`) that writes small ISO3 × year slices into the snapshot, or a sidecar file, as an additive schema change. The app never fetches worlddata at runtime.
- Map ISO2 codes and country names with `build_snapshot.py`'s existing ISO2→ISO3 map (and a name→ISO3 map for the name-keyed sets). Log what fails to match. Never drop rows silently.
- Coverage ends at different years (the World Uncertainty Index at 2024, GDP and inflation at 2023). Show a gap as "no data", the same way portfolio data after 2023 is handled.
- worlddata's own findings apply: **same-month correlations are strong, predictive ones are close to zero.** Anything shown here is "what moved together", never a forecast.

**Views:**

- [ ] **Risk-climate map.** Colour countries on the globe by World Uncertainty Index or Geopolitical Risk value for the selected year, with the contagion network drawn on top.
- [ ] **Events on the year scrubber.** Mark elections, rate hikes (`policy_changes`), geopolitical events and Fed communications along the timeline. Clicking a marker jumps to that year.
- [ ] **Data-driven shock sizes.** Offer an option to set a shock's size from the z-score of that country's uncertainty or geopolitical-risk spike, or of its rate change, instead of a round number. This addresses the uncalibrated-presets caveat in `ROADMAP.md`.
- [ ] **Global shocks driven by real market moves.** Size Phase 7's global currency and rate shock from that year's actual VIX, US 10-year yield and Fed rate moves.
- [ ] **What happened next.** Compare network position with rate spikes, inflation and GDP falls in the same year and the next. Label it as association, not prediction.

## Phase 9: Tabbed views

The app is currently a single view (`web/src/App.tsx`, ~900 lines). Split it into tabs so experiments don't crowd the main view.

| Tab | Content | Depends on |
| --- | --- | --- |
| **Contagion** | the current globe and ranking | existing |
| **Stability** | fragility of the whole network per year, with events overlaid | Phase 7, Phase 8 events |
| **Systemic map** | importance vs. vulnerability scatter, animated across years | Phase 7 |
| **Risk climate** | globe coloured by uncertainty or geopolitical risk, with the network on top | Phase 8 |
| **Backtest** | model ranking vs. real spreads, rates and GDP | Phase 7, Phase 8 |
| **Lab** | unfinished experiments, each marked "experimental" with a short method note | anything |

- [ ] Tab shell: put the active tab in the URL (extend `scenarioUrl.ts` with `view=`) so every tab can be shared as a link. Keep the existing scenario links working, defaulting to `view=contagion`.
- [ ] Share the year, the shocked country and the layer toggles across tabs. A tab never reloads data another tab already has (reuse `yearCache`).
- [ ] Load each tab only when it's opened (`React.lazy`), so the Contagion tab's initial bundle doesn't grow.
- [ ] Mobile: the tab bar scrolls sideways within the `responsive-sweep` layout, with no horizontal page scroll.
- [ ] Lifecycle rule: an experiment starts in **Lab**. It becomes its own tab once it has a verified result, or it is deleted. Record which in this plan.
- [ ] **Build order:** the tab shell plus the **Stability** tab first (no new data, and it proves the shell works), then Systemic map, then Risk climate.

## Phase 10: Outlook tab (projecting forward from 2026)

**Source:** IMF World Economic Outlook, through the DataMapper API (`https://www.imf.org/external/datamapper/api/v1/{indicator}`). Checked 2026-09-23: it needs no key and covers ~229 countries. **Projections run to 2031** for:

- `NGDP_RPCH` (real GDP growth)
- `GGXWDG_NGDP` (government gross debt, % of GDP)
- `GGXCNL_NGDP` (government net lending/borrowing, i.e. the overall budget balance)
- `PCPIPCH` (inflation)
- `BCA_NGDPD` (current account, % of GDP)

Some inputs are **historical only** and can serve only as starting points: `ie` (interest paid on public debt) and `pb` (primary balance) end at 2024, and `Reserves_ARA` / `Reserves_STD` (reserve adequacy, 65 countries) end at 2025. Check the IMF's terms of use before copying any of this data into the repo.

**Framing rules (apply to every chart in the tab):**

- Show which WEO edition each projection comes from (April or October of a given year) on the chart itself.
- Label every chart "projection, not prediction": *if the IMF baseline holds*. Medium-term WEO forecasts are known to lean optimistic, so show ranges (fans), not single lines, wherever possible.
- worlddata found predictive signals close to zero (Phase 8). Nothing here is presented as a forecast of market direction.

**Models:**

- [ ] **Projected networks, 2026–2031.** Extend the year scrubber past 2025, drawing projected years differently (dashed or faded). Each country's buffer grows along its WEO GDP path, and each exposure grows with both countries' nominal GDP, so today's network structure is kept. Then run DebtRank and Eisenberg-Noe as usual, and the Phase 7 fragility index runs 2005–2031. State the "same structure" assumption on the chart.
- [ ] **Debt fan chart per country.** Use the standard debt-dynamics equation, `d(t+1) = d(t)·(1+r)/(1+g) − pb`, with the WEO debt projection as the central line. Build the fan by resampling historical growth and interest-rate surprises, following the IMF's stochastic debt-sustainability method, and show probabilities such as "P(debt > 90% of GDP by 2031)".
- [ ] **Baseline vs. adverse scenario.** Add a toggle between the WEO baseline and a stress path (for example growth 2 points lower for two years, plus a rate shock). The stress path shrinks the projected buffers, and every Outlook chart updates.
- [ ] **Market-implied default risk.** Convert the bond yields in `web/src/data/market_data.json` into an implied default probability (roughly spread ÷ (1 − recovery rate)) and show it next to the model's view. Only countries with yield data can be included.
- [ ] **Turbulence outlook (12 months only).** worlddata found that volatility, unlike market direction, is predictable about a year ahead. Use a simple volatility forecast (HAR- or GARCH-style, on VIX / uncertainty) to set the default shock size. Claim no horizon beyond 12 months.
- [ ] **Crisis early-warning probability (Lab only).** Score reserves adequacy, debt, current account and growth with a logit model, fed with WEO projections. It needs historical crisis dates to train on (the Laeven & Valencia database), whose availability and licence are unverified. Report out-of-sample accuracy (AUROC) before this leaves Lab.

**Build order:** projected networks and debt fan charts first. Both use only the verified WEO data and extend the existing year scrubber.

---

## Out of scope

- Calibrating the historical scenario presets to real losses (tracked separately in `ROADMAP.md`).
- Any change to the DebtRank or Eisenberg-Noe algorithms themselves.
