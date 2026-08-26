# Roadmap

Candidate additions beyond the data-quality fixes already shipped (see
[`docs/superpowers/plans/2026-08-22-data-quality-roadmap.md`](docs/superpowers/plans/2026-08-22-data-quality-roadmap.md)
for that history). Each item below is tracked as it moves from idea to
shipped; unchecked items haven't been started yet.

## Trust & transparency

- [x] **Data provenance indicator** — a country's equity today could be real
      reserves, a GDP-derived guess, or a capital-ratio floor, with no way to
      tell which from the UI. Surface the source (badge/tooltip) in the
      ranking list and on hover. Shipped: hover any ranked country for its
      exact `equitySource`.
- [x] **Confidence-weighted ranking** — render floor/estimated-equity
      countries with a visually distinct (e.g. hatched) bar in the ranking
      list, separate from the "hide financial centers" toggle, so estimated
      vs. reported is legible even when shown. Shipped alongside the
      provenance indicator (same underlying data).

## Model realism

- [x] **Second data layer: portfolio holdings (IMF CPIS)** — BIS only covers
      bank-to-bank loans. IMF's Coordinated Portfolio Investment Survey
      covers cross-border bond/equity holdings, which is how sovereign debt
      contagion actually spread in cases like Greece 2010. Shipped as a
      togglable second network layer ("Include portfolio investment"),
      fetched via DBnomics' JSON mirror of the IMF SDMX API. Coverage is
      2005-2023 (voluntary survey, reporting lag) -- the toggle is disabled
      with a note for 2024/2025 rather than silently showing stale data.
- [ ] **Multi-country / sequential shocks** — shock two or more countries at
      once, or in a delayed sequence, to replay scenarios like "Greece then
      Portugal then Ireland." Deferred: the DebtRank engine already supports
      multiple shocked nodes internally, but Eisenberg-Noe, `App.tsx` state,
      and the whole shock-selection UI are single-country throughout —
      widening that is a real interaction-design decision (how do you pick
      N countries + N magnitudes?) that deserves its own scoping pass.
- [x] **Historical scenario presets** — a dropdown of real crises (2008 GFC,
      2010 Greek debt crisis, 2015-16 China slowdown, 2020 COVID shock) that
      jumps to the right year and pre-fills an illustrative shock magnitude.
      Magnitudes are round numbers, not empirically calibrated to actual
      losses (stated in the UI) — true calibration would need its own pass.

## Engineering health

- [x] **Test coverage for `data-pipeline/`** — the only untested part of the
      repo (CI now runs a `data-pipeline` job alongside `model` and `web`).
      Writing the tests surfaced and fixed a real latent bug: `fetch_bis.py`
      crashed decoding a plain (non-zip) CSV in any context where
      `sys.stdin` isn't a plain `TextIOWrapper` (e.g. under pytest). Linting
      deferred as a separate, smaller follow-up (picking/wiring a Python
      linter is its own decision).
- [ ] **Scheduled data refresh** — a periodic GitHub Actions job that reruns
      the World Bank fetch and opens a PR if reserves/GDP/capital-ratio
      values changed, so the LOCF fix doesn't quietly go stale again.
      Deferred: the BIS edges side needs a manually-downloaded 120MB file,
      so full automation isn't achievable without first deciding what a
      partial (World-Bank-only) auto-refresh should do.

## Product/UX

- [x] **Shareable scenario links** — encode
      `?year=2025&shock=DEU&magnitude=0.6&model=debtrank` in the URL so a
      specific scenario can be linked and reproduced, not just described.
      Shipped with a "Copy link" button next to Reset.
- [x] **"Why did X rank here?" drill-down** — clicking a ranked country shows
      its direct bilateral exposure to the shocked country (or the strongest
      one-hop intermediary if there's no direct link), turning the ranking
      from an opaque number into something explorable.
