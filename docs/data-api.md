# Network data reference

The per-year network snapshots the application runs on are plain static JSON
served from GitHub Pages, and they are usable directly from anywhere:

```
https://lastch1ld.github.io/debtrank-globe/data/network/{year}.json
```

One file per year, **2005 through 2025** (21 files, ~16 MB in total). Verified
2026-09-10: responses carry `Content-Type: application/json; charset=utf-8`
and `Access-Control-Allow-Origin: *`, so a browser, notebook, or script can
fetch them cross-origin with no proxy and no key.

These are the same files the pipeline writes to `data-pipeline/out/by_year/`
(see [`data-pipeline/README.md`](../data-pipeline/README.md)) and the same
ones [`debtrank-model`](../model/README.md)'s `build_exposure_network` reads.

## Shape

```json
{
  "nodes": [...],
  "edges": [...],
  "portfolio_edges": [...]
}
```

### `nodes`

One entry per country/jurisdiction; 217 in the 2020 file. `id` is ISO 3166-1
alpha-3 and is the key every edge refers to.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | ISO alpha-3 country code |
| `name` | string | World Bank display name |
| `lat`, `lng` | number \| null | Centroid, for map rendering only |
| `gdp_usd` | number \| null | GDP, current US$ |
| `reserves_usd` | number \| null | Total reserves including gold, current US$ |
| `external_debt_usd` | number \| null | Total external debt stocks, current US$ |
| `bank_capital_ratio_pct` | number \| null | Bank capital to assets, % |

Every financial field is nullable — coverage genuinely varies by country and
year, and a `null` means "not reported", never zero. Anything consuming these
needs a fallback policy; the one this project uses is
[`node_equity`](../model/debtrank_model/network.py), and it is public
precisely so results stay comparable.

### `edges`

Bilateral cross-border **banking** claims; 3,230 in the 2020 file.

| Field | Type | Meaning |
| --- | --- | --- |
| `creditor` | string | Node id holding the claim |
| `debtor` | string | Node id owing it |
| `amount` | number | Outstanding claim, US$ |
| `period` | string | Source quarter, e.g. `2020-Q4` |

Direction matters: `creditor` stands to lose `amount` if `debtor` defaults.
The Eisenberg–Noe liability matrix is this transposed — see
[`web/src/lib/analysis.ts`](../web/src/lib/analysis.ts).

### `portfolio_edges`

Cross-border **bond and equity** holdings — a largely distinct contagion
channel from bank lending, and the one that actually carried the 2010 euro
sovereign crisis. Same three fields as `edges`, without `period`; 12,322 in
the 2020 file.

**Coverage ends at 2023.** CPIS is a voluntary survey with a reporting lag,
so 2024 and 2025 carry an empty `portfolio_edges` array rather than stale
numbers. The key is always present; check its length, don't assume data.

## Reading it

```python
import requests
from debtrank_model import build_exposure_network, run_debtrank

URL = "https://lastch1ld.github.io/debtrank-globe/data/network/{year}.json"
snapshot = requests.get(URL.format(year=2020)).json()

network = build_exposure_network(snapshot, include_portfolio=True)
result = run_debtrank(network, {"GRC": 1.0})
print(result.debtrank)
```

```js
const snapshot = await (await fetch(
  "https://lastch1ld.github.io/debtrank-globe/data/network/2020.json",
)).json();
```

## Stability

The files are versioned in git under `web/public/data/network/`, so any
revision is reachable by commit. Fields are added, not renamed or removed —
`portfolio_edges` arrived this way and older consumers kept working. There is
no `Cache-Control` guarantee beyond whatever GitHub Pages sets; pin a commit
if you need a byte-stable input.

## Sources and attribution

If you publish anything derived from these files, attribute the upstream
sources, not this repository:

- **External debt, reserves, GDP, bank capital ratio** — [World Bank
  Indicators API](https://api.worldbank.org/v2/), International Debt
  Statistics. CC BY 4.0.
- **Bilateral banking claims (`edges`)** — [BIS Locational Banking
  Statistics](https://data.bis.org/), used under the BIS's terms of permitted
  use. Only a small, derived, aggregated network is redistributed here — not
  bulk BIS data. Redistributing these files onward is your call to check
  against those terms.
- **Portfolio holdings (`portfolio_edges`)** — IMF [Coordinated Portfolio
  Investment Survey](https://data.imf.org/CPIS), retrieved via DBnomics'
  JSON mirror of the IMF SDMX API.

The derived network construction and the code are MIT — see
[LICENSE](../LICENSE).
