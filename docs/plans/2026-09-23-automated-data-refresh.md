# Automated Data Refresh Plan

> **For agentic workers:** Work phase by phase, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Check items off as they ship and keep them for traceability.

**Goal:** Every dataset the app uses, now and in the future, is refreshed without manual steps. Nothing reaches `master` without a reviewed PR whose body shows what changed. A source that quietly stops updating gets noticed.

**Companion plan:** `docs/plans/2026-09-23-data-model-granularity.md` (PR #24) adds new sources: BIS liabilities and sector splits, CPIS debt-only data, worlddata slices and IMF WEO projections. Each one must plug into the mechanism below instead of getting its own one-off workflow.

## Where things stand (checked 2026-09-23)

| Source | Used for | Refreshed today? | Notes |
| --- | --- | --- | --- |
| World Bank Indicators API | node GDP, reserves, external debt, capital ratio | **Yes.** Monthly, via `refresh-data.yml` → PR | Changes only indicator values, never the graph's shape |
| BIS LBS bulk CSV | banking `edges` | **No, manual** | See finding 1 |
| IMF CPIS via DBnomics | `portfolio_edges` | **No, manual** | See finding 2 |
| FRED | `web/src/data/market_data.json` | **No, manual** | Endpoint responds 200 without a key |
| Border outlines (`fetch_borders.py`) | globe coastlines | No | Changes very rarely. Manual is fine |
| worlddata slices (Phase 8) | risk climate, events | not built yet | |
| IMF WEO DataMapper (Phase 10) | projections to 2031 | not built yet | Responds 200 without a key |

**Finding 1: the BIS bulk file can be downloaded by automation.** `refresh-data.yml` (and `data-pipeline/README.md`) say the BIS file "has to be downloaded by hand". That is not the case now. A plain `curl` of `https://data.bis.org/static/bulk/WS_LBS_D_PUB_csv_col.zip` returns `200`, `content-length: 122528829` (~117 MB), `last-modified: Tue, 22 Sep 2026` and an `etag`. So a runner can fetch it, and the `etag` / `last-modified` headers make "has it changed?" a cheap HEAD request.

**Finding 2: the DBnomics CPIS mirror appears stale.** Its `IMF/CPIS` dataset reports `indexed_at: 2025-04-09`, about 17 months ago. The IMF moved to a new data portal (data.imf.org, SDMX 3.0) around then, which may be why. Check whether newer CPIS rounds exist upstream. If they do, move `fetch_cpis.py` to the IMF's own API. **Not verified yet.**

## Design

One registry, one cheap probe, one heavy rebuild, and a PR at the end.

1. **Source registry:** `data-pipeline/sources.json`, one entry per source:
   - `id`, `url` (or a list of URLs), `fetch` (script and arguments)
   - `cadence`: the expected upstream release rhythm, used to detect staleness
   - `detect`: `etag`, `last-modified`, a content `sha256`, or an API "last updated" field
   - `licence` and `attribution`. Required: a check fails if either is missing, so new sources can't be copied in without a licence decision.
   - `may_change`: what this source is allowed to touch, e.g. `node_indicators`, `edges`, `portfolio_edges`, `market_data` or a new sidecar file. This is what the invariant tests enforce.
2. **Lock file:** `data-pipeline/sources.lock.json` stores the last-seen `etag`, `last-modified` and/or hash for each source, plus when it was fetched. It is committed, so every data PR also shows which upstream version it came from.
3. **Probe workflow (cheap, weekly):** HEAD or light-GET every source and compare with the lock. If nothing changed, exit. If something changed, trigger the rebuild for only those sources (`workflow_dispatch` / `workflow_call` with the list of changed source ids).
4. **Rebuild workflow (heavy, on demand):** run only the fetch scripts for the changed sources, then `build_snapshot.py --by-year` and `sync_web_data.py`. Cache the BIS zip with `actions/cache`, keyed by its `etag`.
5. **The PR is the gate.** The rebuild never pushes to `master` (the branch is protected anyway). It opens one PR per run that includes a **diff report** (see Phase 3).

Why not just rebuild everything on a timer? Most runs would be no-ops that download ~117 MB. The existing workflow already reasons the same way ("a nightly run would be almost entirely no-ops"), and the probe keeps that reasoning while covering every source.

---

## Phase 0: Sanity check (do this first)

- [x] **Re-run the source checks,** and record the date and results here: *Results below.*
  - HEAD the BIS bulk zip: is it still `200`, and does it still send `etag` / `last-modified`?
  - Check DBnomics `IMF/CPIS` `indexed_at`.
  - Check whether data.imf.org has CPIS rounds newer than the mirror.
- [ ] **Measure before designing around guesses.** Time one full BIS download plus `fetch_bis.py --by-year` on a GitHub runner (`workflow_dispatch`), and check that it fits the runner's disk and memory. *Not done: it needs the ~117 MB BIS download, which hasn't been approved. Until it is measured, the split below stays.*
- [x] **Check whether the probe/rebuild split is worth it.** If the full rebuild turns out to be cheap, a simple monthly full rebuild may beat a registry, a lock file and two workflows. Pick the simpler option if it's good enough. *Result: keep the split. The probe costs a HEAD request per source; the rebuild's cost is still unmeasured.*
- [x] **Line up with the companion plans:** `docs/plans/2026-09-23-data-model-granularity.md` (its new sources) and `docs/plans/2026-09-23-test-strategy.md` (the diff report and tripwires share fixtures with its data-contract tests).
- [x] Write the result here (what changed, what was dropped) before starting Phase 1.

  **Result (2026-10-09):**

  - **BIS bulk file:** still `200` with `etag` and `last-modified`, ~117 MB. `last-modified` is now **2026-10-07**, so a newer release than the plan's 2026-09-22 observation exists, and the committed data predates it.
  - **DBnomics `IMF/CPIS`:** `updated_at: 2025-04-08`, `indexed_at: 2025-04-09`. About 549 days old against a 270-day threshold, so the probe flags it as stale. Finding 2 is confirmed for the mirror; whether newer rounds exist at data.imf.org is **still unchecked**.
  - **World Bank:** the API reports `lastupdated: 2026-10-08` in its response header.
  - **FRED and Natural Earth:** FRED's `Last-Modified` moves daily, so it can't signal "the data changed"; it is recorded for its licence and not probed. Natural Earth sends only an `etag` and changes rarely; also not probed.
  - **Scope of the first PR:** Phase 1 and the alerts from Phase 4. Phases 2 and 3 (rebuild in CI, the diff report, `workflow_call`) are not built.

## Phase 1: Registry and probe

- [x] Add `sources.json` for the sources in use today (World Bank, BIS LBS, CPIS, FRED, borders), with licences taken from `docs/data-api.md`. *(`data-pipeline/sources.json`, plus `sources.lock.json`. The licences come from `docs/data-api.md`; FRED has none recorded there, so its entry says "varies per series, check before redistributing" and still needs a decision.)*
- [x] Add `data-pipeline/probe_sources.py`: reads the registry, fetches headers or a light response, compares with `sources.lock.json`, and prints the ids of changed sources. Handle servers without an `etag` by falling back to `last-modified`, then to a hash of a small response. *(Also `probe_issues.py`, which turns its report into issues. Detection is an ETag, else Last-Modified, else a hash of the first MB, or a JSON field; the as-of date comes from Last-Modified or that field.)*
- [x] Tests: registry schema (a missing `licence` fails), and probe logic against recorded responses. No live network in unit tests. *(`tests/test_probe_sources.py`, 33 tests, no network; one of them caught a crash on a registry entry with `detect: null`.)*
- [x] `.github/workflows/probe-sources.yml`: weekly cron plus `workflow_dispatch`. It only reads, and it starts the rebuild when something changed. *It does not start a rebuild, because there is no rebuild workflow yet; it opens issues instead.*

## Phase 2: Full rebuild in CI

- [ ] Remove the manual download step: `fetch_bis.py` downloads the bulk zip itself, or accepts a URL, streaming to disk rather than into memory.
- [ ] `.github/workflows/rebuild-data.yml`, which replaces `refresh-data.yml`:
  - Only the fetch scripts for sources that changed run. A World Bank-only change keeps today's guarantees exactly: `refresh_worldbank.py`'s "change the numbers, never the shape" rule stays for that path.
  - Cache the BIS zip by `etag`.
  - Set `timeout-minutes` from a measured run, not a guess. The existing job's retry note about the World Bank API applies here too.
  - Keep `shell: bash` (pipefail) for anything piped into `tee`. `refresh-data.yml` explains why.
- [ ] Update the lock file in the same commit as the regenerated data.
- [ ] Fix the outdated "BIS must be downloaded by hand" comments in `refresh-data.yml` and `data-pipeline/README.md` once this ships.

## Phase 3: A PR you can actually review

The PR body is the reviewer's only view of an unattended change, so it has to answer "is this safe to merge?" on its own.

- [ ] **Diff report** (`data-pipeline/diff_snapshots.py`, before vs. after, for each year):
  - Node, edge and portfolio-edge counts, and the number of distinct creditors.
  - The 10 largest absolute edge changes.
  - Countries whose `equitySource` changed (for example reserves → GDP estimate).
  - **Reference scenarios:** a fixed set of shocks (e.g. GRC 1.0 in 2010, USA 0.5 in 2008, CHN 0.5 in 2015), run through `debtrank-model`. List the countries whose rank moved by 5 or more places.
  - Which source versions the change came from (from the lock file).
- [ ] **Tripwires that fail the job instead of opening a PR:**
  - A year's edge count falls by more than 20% with no matching registry change.
  - A year file disappears, or a field is removed or renamed (schema must be additive only; see `docs/data-api.md` "Stability").
  - Any test failure.
- [ ] **CI on bot PRs:** PRs opened with `GITHUB_TOKEN` don't trigger `ci.yml` (the current workflow even tells reviewers to push an empty commit). Fix this properly: either make `ci.yml` callable (`workflow_call`) and run it inside the rebuild job before the PR is opened, or open the PR with a GitHub App token. **Recommended: `workflow_call`.** It needs no new secret.

## Phase 4: Staleness and failure alerts

- [x] Staleness check in the probe: if a source hasn't changed for longer than its `cadence` plus a grace period, open or update **one** issue per source (labelled `data-stale`, de-duplicated). This is exactly how the DBnomics CPIS problem would have surfaced. *(Measured from the source's own as-of date, not from when we last saw a change, so it works on the first run.)*
- [x] Failure alert: a failed probe or rebuild opens or updates a single `data-refresh-failed` issue instead of failing silently. This matters most for jobs nobody watches. *(Probe only. The rebuild doesn't exist yet.)*
- [ ] Show the data's age: write each source's "as of" date into an additive `meta.json` next to the year files, and show it in the app footer and in `docs/data-api.md`.

## Phase 5: New sources from the granularity plan

Each new source is registry entries plus fetch scripts. No new workflows.

- [ ] BIS liabilities and sector splits (granularity plan Phases 1 and 5): same bulk file, so the same registry entry, just more filters.
- [ ] CPIS: switch to the IMF's own API if finding 2 holds.
- [ ] worlddata (granularity plan Phase 8): take slices from a **pinned worlddata commit or release**, not `main`. Bump the pin in its own PR so a worlddata change can never silently change this app's data. Only permissively licensed datasets (the CC BY-SA sets stay out).
- [ ] IMF WEO (granularity plan Phase 10): cadence of April and October editions, with the edition recorded in the lock file and shown on every projection chart. Check the IMF's terms of use before copying data into the repo.
- [ ] FRED market data: yearly granularity, so a monthly probe is enough.

## CPIS upstream (looked into 2026-10-26)

Finding 2 holds, and the upstream has moved on:

- **The IMF renamed the dataset.** CPIS is now the dataflow `PIP`, "Portfolio Investment Positions by Counterpart Economy (formerly CPIS)", `IMF.STA:PIP` version 5.0.0, on `https://api.imf.org/external/sdmx/2.1/` (no key; `dataflow/IMF.STA/all/latest` lists 189 flows, `datastructure/IMF.STA/DSD_PIP/latest` gives its dimensions: `COUNTRY`, `ACCOUNTING_ENTRY`, `INDICATOR`, `SECTOR`, `COUNTERPART_SECTOR`, `COUNTERPART_COUNTRY`, `FREQUENCY`).
- **It has data the mirror lacks.** For the US as reporter, with 244 counterpart economies per year, it has annual positions for **2024 and 2025** and half-yearly ones through 2025-S2, against our data and the DBnomics mirror ending at 2023. I only looked at the US as reporter; whether other reporters have filed 2024 and 2025 is not checked.
- **Indicator codes, verified** (this resolves the "debt-only" item in the granularity plan, Phase 5): `P_TOTINV_P_USD` total portfolio investment, `P_F3_P_USD` debt securities, `P_F51_P_USD` equity and fund shares, all positions in USD, with long-term (`P_F3_L_P_USD`) and short-term (`P_F3_S_P_USD`) debt split out. Our current series is the total.
- **Licence caveat before moving to it:** the IMF's terms (https://www.imf.org/en/about/copyright-and-terms) allow copying, derivative works and distribution with attribution, but require permission for commercial reuse and prohibit bulk download by automated technology without explicit permission. A scheduled job pulling ~70 reporters' worth of series is automated download; whether the SDMX API counts as the permitted route is not stated, so ask `copyright@imf.org` first. The same terms bear on `portfolio_edges` being published here under an MIT-licensed repo.
- **Decision (2026-10-27): the CPIS layer was withdrawn instead.** Given the licence caveat above, the portfolio layer is gone: the toggle, the `portfolio` URL parameter, the model option (web and Python), the CPIS registry and lock entries, and the data in the published files. `portfolio_edges` stays in every year file as an empty list so the schema is unchanged; `fetch_cpis.py` and its tests are kept, marked unused, in case permission is obtained. Moving to the IMF's own API is only worth doing after that permission, and the findings above are the starting point for it.

## FRED licence (looked into 2026-10-26)

The market indicators (`market_data.json`) come from three OECD series that FRED serves: `IRLTLT01` (10Y yield), `IRSTCI01` (short-term rate), `SPASTT01` (share prices).

- **Who owns it:** the OECD. FRED labels all three "Copyrighted: Citation Required" (read on the US series; the other countries are the same series families, which I assumed rather than checked one by one).
- **OECD's terms (read directly on oecd.org, last updated 2024-07-01):** data may be extracted, copied, adapted, distributed and embedded for any purpose, commercial included, with credit to the OECD in the form "OECD (year), (dataset name), (data source) DOI or URL (accessed on (date))", unless a dataset has third-party ownership or extra restrictions. Nothing found suggests these three have any.
- **FRED's terms (quoted from https://fred.stlouisfed.org/legal/ by a page-fetch tool; I did not read the page in a browser, unlike the OECD's and IMF's):** prohibit using FRED content to "store, cache, or archive any portion" of it and to "incorporate any FRED Content in any database, compilation, archive, cache, or other medium". Retrieving through FRED's CSV export and committing the result arguably does that. I am not a lawyer and did not find an exception for citation-required series.
- **Not done:** the attribution above is now in `docs/data-api.md` and the registry, but the app itself shows these numbers with no credit line; the OECD asks for credit.
- **Resolved 2026-10-27 (option b):** the OECD's own SDMX API has the same series (`DF_FINMARK`, measures `IRLT`, `IRSTCI`, `SHARE`), and `fetch_market_data.py` now uses it, so only the OECD's terms apply. Of 2,365 overlapping values 2,307 are identical and 39 differ only by the OECD rounding to two decimals; 19 differ for real: Iceland's long-term rate (the OECD now publishes the nominal series, 7.94% in 2005 against FRED's older 4.09%) and Chile's share prices. The OECD adds 505 values for 14 more countries. The app now shows the credit the OECD asks for, with the retrieval date. The OECD's terms say to check third-party ownership in the dataset's metadata: the SDMX metadata states none, but I did not see the Data Explorer's own source tab.
- **Options that were open (a was rejected, b taken, c not needed):** (a) leave as is and accept the FRED-terms risk; (b) fetch the same series from the OECD's own API (its SDMX service at sdmx.oecd.org; **I did not check that it offers these series**), so only the OECD's terms apply: a change to `fetch_market_data.py`, and the dataset codes there differ from FRED's `M156N` ids; (c) drop the market check. Needs a decision.

## Suggested cadences

| Source | Upstream rhythm | Probe | Stale after |
| --- | --- | --- | --- |
| BIS LBS | quarterly releases | weekly | 5 months |
| IMF CPIS | semi-annual, with a long lag | weekly | 9 months |
| World Bank | continuous, annual indicators | weekly | 3 months |
| IMF WEO | April and October | weekly | 7 months |
| FRED | daily (we use year-end values) | weekly | 2 months |
| worlddata | whenever it's pushed | weekly (pin bump) | none (optional) |

The staleness thresholds are starting guesses. Tune them after the first quarter of real runs.

## Out of scope

- Automatically merging data PRs. A person always merges.
- Refreshing `world_borders.json` automatically.
