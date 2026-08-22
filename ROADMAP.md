# Roadmap

Candidate additions beyond the data-quality fixes already shipped (see
[`docs/superpowers/plans/2026-08-22-data-quality-roadmap.md`](docs/superpowers/plans/2026-08-22-data-quality-roadmap.md)
for that history). Each item below is tracked as it moves from idea to
shipped; unchecked items haven't been started yet.

## Trust & transparency

- [ ] **Data provenance indicator** — a country's equity today could be real
      reserves, a GDP-derived guess, or a capital-ratio floor, with no way to
      tell which from the UI. Surface the source (badge/tooltip) in the
      ranking list and on hover.
- [ ] **Confidence-weighted ranking** — render floor/estimated-equity
      countries with a visually distinct (e.g. hatched) bar in the ranking
      list, separate from the "hide financial centers" toggle, so estimated
      vs. reported is legible even when shown.

## Model realism

- [ ] **Second data layer: portfolio holdings (IMF CPIS)** — BIS only covers
      bank-to-bank loans. IMF's Coordinated Portfolio Investment Survey
      covers cross-border bond/equity holdings, which is how sovereign debt
      contagion actually spread in cases like Greece 2010. Add as a
      togglable second network layer.
- [ ] **Multi-country / sequential shocks** — shock two or more countries at
      once, or in a delayed sequence, to replay scenarios like "Greece then
      Portugal then Ireland."
- [ ] **Historical scenario presets** — a dropdown of real crises (2008
      Lehman, 2010 Greek debt crisis, 2020 COVID shock) that jumps to the
      right year and pre-fills a shock magnitude calibrated to what actually
      happened.

## Engineering health

- [ ] **Test/lint coverage for `data-pipeline/`** — the only untested part of
      the repo (CI currently only runs `model` and `web`). Unit tests for
      `fetch_bis.py`/`build_snapshot.py` would catch silent-drop and
      staleness bugs mechanically instead of by hand.
- [ ] **Scheduled data refresh** — a periodic GitHub Actions job that reruns
      the World Bank fetch and opens a PR if reserves/GDP/capital-ratio
      values changed, so the LOCF fix doesn't quietly go stale again.

## Product/UX

- [ ] **Shareable scenario links** — encode
      `?year=2025&shock=DEU&magnitude=0.6&model=debtrank` in the URL so a
      specific scenario can be linked and reproduced, not just described.
- [ ] **"Why did X rank here?" drill-down** — clicking a ranked country shows
      its direct exposure path back to the shocked node, turning the ranking
      from an opaque number into something explorable.
