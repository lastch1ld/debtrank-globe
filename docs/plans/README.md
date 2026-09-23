# Plans

Design and implementation plans, one file per piece of work, named `YYYY-MM-DD-topic.md`. Each plan tracks its own progress with checkboxes. This index covers only what the individual plans can't: how a batch of plans fits together, and why.

## September 2026 batch: data model, refresh, tests, UI kit

**Start here** on a new device or in a new session. Read this section, then the plan you're picking up.

### Backstory

On 2026-09-23 a review of the data model found that **only 28 of 217 countries can ever be distressed through the banking layer**. `fetch_bis.py` keeps only BIS "claims" (`L_POSITION=C`), so every banking creditor is a BIS-reporting country. DebtRank moves distress to a creditor through its claims, so the other ~190 countries can be shocked but never appear in a ranking.

That started a chain of plans, in the order they were written:

1. **Fix coverage and granularity** (the review's findings), plus per-country and per-relation detail.
2. **Alternative models:** the network's stability over time, importance vs. vulnerability, fire sales, funding withdrawal, backtests.
3. **Using [lastch1ld/worlddata](https://github.com/lastch1ld/worlddata)** (a sibling repo of free datasets) for alternative views, and splitting the app into **tabs** so experiments don't crowd the main view.
4. **An Outlook tab** projecting forward from 2026 with IMF WEO projections, which run to 2031.
5. **Automating every data source's refresh.** Checking this found that the BIS bulk file *can* be downloaded by automation, and that the DBnomics CPIS mirror looks ~17 months stale.
6. **A test strategy.** Found: the `web/tests` "UI tests" only check that source files contain certain strings; there are no component or E2E tests; oxlint doesn't run in CI.
7. **A unified UI kit.** Found: no design tokens, and 19 hex colours hard-coded in the globe and chart. Built to be reusable in other lastch1ld projects later.

### The plans

| Plan | PR | Covers |
| --- | --- | --- |
| [2026-09-23-data-model-granularity.md](2026-09-23-data-model-granularity.md) | [#24](https://github.com/lastch1ld/debtrank-globe/pull/24) | Phases 0–10: coverage, consistency, country/pair panels, sovereign granularity, the buffer decision, alternative models, worlddata, tabs, Outlook |
| [2026-09-23-automated-data-refresh.md](2026-09-23-automated-data-refresh.md) | [#25](https://github.com/lastch1ld/debtrank-globe/pull/25) | Source registry, weekly probe, rebuild-on-change, reviewed data PRs, staleness alerts |
| [2026-09-23-test-strategy.md](2026-09-23-test-strategy.md) | [#26](https://github.com/lastch1ld/debtrank-globe/pull/26) | TS/Python parity tests on shared result files, property tests, data-file checks, component tests, Playwright E2E, CI wiring |
| [2026-09-23-unified-web-ui.md](2026-09-23-unified-web-ui.md) | [#27](https://github.com/lastch1ld/debtrank-globe/pull/27) | Tokens shared by the HTML, WebGL and chart layers; a minimal component kit; extraction to `@lastch1ld/ui` later |

Until those PRs are merged, each file exists only on its own `plan/*` branch, so the links above resolve only once all four are on `master`.

### Build order across plans

```
PR #23 (responsive-sweep) merged
  └─ every plan: Phase 0 sanity check
      ├─ #24 Phase 1 coverage fix  ─────────────── ships with #26 golden files + data-file checks
      ├─ #24 Phases 2–6 ────────────────────────── each ships with the tests listed in #26
      ├─ #27 Phases 1–3 (tokens, primitives, Tabs/Drawer)
      │     └─ #24 Phase 9 tab shell
      │           └─ #24 Phases 7, 8, 10 as tabs (Stability first; it needs no new data)
      └─ #25 registry + probe; #24's new sources plug into it, never their own workflows
```

### Decisions already made

- **Every plan starts with a Phase 0 sanity check,** which verifies the plan still makes sense before anything is built. The plans were written quickly, in one session, and several claims are marked unverified.
- **The UI kit stays in-repo** (`web/src/ui/`, no imports from app code) until a *second* project adopts it. Only then is it extracted as `@lastch1ld/ui`.
- **The UI kit consolidates, it doesn't redesign.** No new palette, no light mode.
- **No CC BY-SA data from worlddata** (its Wikipedia-derived sets), because share-alike would carry over to this repo's data. Only permissively licensed datasets come in.
- **worlddata is used through a pinned commit or release,** never `main`, so it can't silently change this app's data.
- **Projections are "if the IMF baseline holds", never forecasts.** worlddata's own analysis found predictive signals close to zero.
- **Automated data changes always go through a PR a person merges.** No auto-merge.

### Practical notes

- **`master` only accepts PRs;** the owner account can push past the protection without noticing, so don't. Every change goes through a PR.
- **GitHub account:** use `lastch1ld`. On machines with several `gh` accounts, run `gh auth switch --user lastch1ld` in the same command as any push or PR.
- **Picking up in a fresh session:** "Read `docs/plans/README.md`, then do Phase 0 of `<plan>`." The plans are written to stand on their own. No chat history is needed.
