# web

React Three Fiber static site: a 3D globe of the country exposure network,
with click-to-shock DebtRank simulation running entirely client-side.

```bash
npm install
npm run dev      # dev server
npm test         # vitest, checks lib/debtrank.ts against the same fixtures
                  # used by model/'s pytest suite (see debtrank.test.ts)
npm run build
```

`src/lib/debtrank.ts` is a TypeScript port of `model/debtrank_model/debtrank.py`,
kept structurally identical so both can be checked against the same toy-network
fixtures. `src/data/network_snapshot.json` is a copy of
`data-pipeline/out/network_snapshot.json` — regenerate it there and copy it
over when the underlying data pipeline output changes.
