# Contributing

This is an open-source portfolio project; contributions, issues, and forks are welcome.

## Layout

- `data-pipeline/` (Python) — fetches and normalizes World Bank + BIS data. See its own README for setup.
- `model/` (Python) — DebtRank and Eisenberg-Noe implementations. `cd model && pip install -e ".[dev]" && pytest`.
- `web/` (TypeScript) — React Three Fiber visualization. `cd web && npm install && npm test`.

## Before opening a PR

- `model/`: `pytest` must pass, including the correctness tests in `debtrank_model/tests/`.
- `web/`: `npm test` (vitest) and `npx tsc -b` must pass.
- If you change the DebtRank algorithm in `model/debtrank_model/debtrank.py`, mirror the change in
  `web/src/lib/debtrank.ts` and keep both test suites' fixtures in sync — the whole point of shipping
  two implementations is that they agree on the same toy networks.
