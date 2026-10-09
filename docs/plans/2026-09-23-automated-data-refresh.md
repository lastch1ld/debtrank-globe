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

- [ ] **Re-run the source checks,** and record the date and results here:
  - HEAD the BIS bulk zip: is it still `200`, and does it still send `etag` / `last-modified`?
  - Check DBnomics `IMF/CPIS` `indexed_at`.
  - Check whether data.imf.org has CPIS rounds newer than the mirror.
- [ ] **Measure before designing around guesses.** Time one full BIS download plus `fetch_bis.py --by-year` on a GitHub runner (`workflow_dispatch`), and check that it fits the runner's disk and memory.
- [ ] **Check whether the probe/rebuild split is worth it.** If the full rebuild turns out to be cheap, a simple monthly full rebuild may beat a registry, a lock file and two workflows. Pick the simpler option if it's good enough.
- [ ] **Line up with the companion plans:** `docs/plans/2026-09-23-data-model-granularity.md` (its new sources) and `docs/plans/2026-09-23-test-strategy.md` (the diff report and tripwires share fixtures with its data-contract tests).
- [ ] Write the result here (what changed, what was dropped) before starting Phase 1.

## Phase 1: Registry and probe

- [ ] Add `sources.json` for the sources in use today (World Bank, BIS LBS, CPIS, FRED, borders), with licences taken from `docs/data-api.md`.
- [ ] Add `data-pipeline/probe_sources.py`: reads the registry, fetches headers or a light response, compares with `sources.lock.json`, and prints the ids of changed sources. Handle servers without an `etag` by falling back to `last-modified`, then to a hash of a small response.
- [ ] Tests: registry schema (a missing `licence` fails), and probe logic against recorded responses. No live network in unit tests.
- [ ] `.github/workflows/probe-sources.yml`: weekly cron plus `workflow_dispatch`. It only reads, and it starts the rebuild when something changed.

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

- [ ] Staleness check in the probe: if a source hasn't changed for longer than its `cadence` plus a grace period, open or update **one** issue per source (labelled `data-stale`, de-duplicated). This is exactly how the DBnomics CPIS problem would have surfaced.
- [ ] Failure alert: a failed probe or rebuild opens or updates a single `data-refresh-failed` issue instead of failing silently. This matters most for jobs nobody watches.
- [ ] Show the data's age: write each source's "as of" date into an additive `meta.json` next to the year files, and show it in the app footer and in `docs/data-api.md`.

## Phase 5: New sources from the granularity plan

Each new source is registry entries plus fetch scripts. No new workflows.

- [ ] BIS liabilities and sector splits (granularity plan Phases 1 and 5): same bulk file, so the same registry entry, just more filters.
- [ ] CPIS: switch to the IMF's own API if finding 2 holds.
- [ ] worlddata (granularity plan Phase 8): take slices from a **pinned worlddata commit or release**, not `main`. Bump the pin in its own PR so a worlddata change can never silently change this app's data. Only permissively licensed datasets (the CC BY-SA sets stay out).
- [ ] IMF WEO (granularity plan Phase 10): cadence of April and October editions, with the edition recorded in the lock file and shown on every projection chart. Check the IMF's terms of use before copying data into the repo.
- [ ] FRED market data: yearly granularity, so a monthly probe is enough.

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
