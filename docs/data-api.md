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

Bilateral cross-border **banking** claims; 3,229 in the 2020 file. A pair
that reports a zero claim has no edge, so every `amount` is above zero.

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

**Always empty.** This list used to hold cross-border bond and equity
holdings from the IMF's Coordinated Portfolio Investment Survey. It was
withdrawn because the IMF's terms require permission for reuse of its data
that has not been obtained. The key stays, so a consumer that reads it keeps
working and simply finds nothing; do not rely on it ever being filled again.
Earlier versions of these files are still in this repository's git history.

### `pairs.json`

A small history index next to the year files, for drawing how a pair's
exposure moved without fetching all 21 years:
`https://lastch1ld.github.io/debtrank-globe/data/network/pairs.json`.

```json
{"first_year": 2005, "unit": "usd_millions", "min_peak_usd": 5e9,
 "pairs": {"DEU|GRC": {"ab": [0, 12, ...], "ba": [3, 4, ...]}}}
```

The key is the two ISO3 ids sorted; `ab` is the sorted-first country's claim
on the other and `ba` the reverse, one value per year from `first_year`, in
USD millions. Banking claims only. Only pairs whose
combined exposure ever reached `min_peak_usd` are present, so a missing pair
means "small", not "zero". It is derived from the year files by
`data-pipeline/build_pairs.py`; a test fails if the two drift apart.

## Reading it

```python
import requests
from debtrank_model import build_exposure_network, run_debtrank

URL = "https://lastch1ld.github.io/debtrank-globe/data/network/{year}.json"
snapshot = requests.get(URL.format(year=2020)).json()

network = build_exposure_network(snapshot)
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
- **Portfolio holdings (`portfolio_edges`)** — withdrawn; see above. Earlier
  versions of the files used the IMF [Coordinated Portfolio Investment
  Survey](https://data.imf.org/CPIS), which the IMF's terms do not let us
  redistribute without permission.

- **Market indicators** (10-year bond yield, short-term rate, share-price
  change; shown in the app's market check, bundled with the app and not part
  of these files) — OECD (2026), Financial market (`DF_FINMARK`: measures
  `IRLT`, `IRSTCI`, `SHARE`), https://data-explorer.oecd.org/ (retrieved
  2026-10-27), fetched from the OECD's own SDMX API. The OECD's terms allow
  reuse with credit; the app shows that credit under the market check. Until
  2026-10 these came through FRED, whose terms do not allow keeping a copy.

The code, and the way the network is constructed from these sources, are
MIT — see [LICENSE](../LICENSE). The data values in these files are not ours to
license: they stay under the terms of the sources above, which are not MIT.
