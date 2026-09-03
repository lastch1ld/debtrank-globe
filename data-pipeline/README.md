# data-pipeline

Fetches and normalizes the two public data sources into one network snapshot
(`out/network_snapshot.json`) that `model/` and `web/` both consume.

## Steps

```bash
pip install -r requirements.txt

# 1. Country node attributes (external debt, reserves, GDP, lat/lng)
python fetch_worldbank.py out/nodes.json

# 2. Bilateral cross-border bank exposures (creditor -> debtor edges)
#    Requires the BIS LBS bulk CSV: download from
#    https://data.bis.org/static/bulk/WS_LBS_D_PUB_csv_col.zip (~120MB zipped)
#    and unzip it first.
python fetch_bis.py /path/to/WS_LBS_D_PUB_csv_col.csv out/edges.json

# 3. Merge into the final ISO3-keyed network snapshot
python build_snapshot.py

# 4. Simplified country border outlines, for rendering coastlines on the globe
python fetch_borders.py
```

### Historical year scrubber data

The web app's year scrubber needs one network snapshot per year rather than
a single latest-value snapshot:

```bash
# 1. Per-year node attributes (one value per year instead of "latest")
python fetch_worldbank.py --by-year 2005:2025 out/nodes_by_year.json

# 2. Per-year Q4 bilateral exposures, single pass over the bulk CSV
python fetch_bis.py /path/to/WS_LBS_D_PUB_csv_col.csv out/edges_by_year.json --by-year 2005:2025

# 3. Merge into out/by_year/{year}.json (same {"nodes":[...], "edges":[...]} shape)
python build_snapshot.py --by-year
```

### Market data (bond yields, policy rates, stock indices)

```bash
# Three FRED series, no API key needed (public CSV export): 10Y government
# bond yield, short-term/policy interest rate, and stock index YoY change.
# Coverage differs per series (a country can have some and not others).
python fetch_market_data.py out/market_data.json
```

## Publishing to the web app

`out/` is this pipeline's build output and is not tracked in git. The web
app's copies are — `web/src/data/` is bundled at build time and
`web/public/data/network/` is fetched at runtime, and GitHub Pages serves
both. So regenerating anything above is only half the job; the copy is the
other half:

```bash
python sync_web_data.py           # copy every derived file into web/
python sync_web_data.py --check   # report drift, exit 1 if any (no writes)
```

Run it after every pipeline run. This used to be a handful of `cp` lines in
this README, and one of them was missing: `network_snapshot.json` was never
listed, so the per-country `bank_capital_ratio_pct` added in 01c32ee landed
in `out/` and stopped there. The app went on using the flat 8% fallback that
commit existed to remove — for a month, with nothing to notice it.

Output: `out/network_snapshot.json` — `{"nodes": [...], "edges": [...]}`,
~4,400 real bilateral country-country exposure edges across ~215 countries.
`out/world_borders.json` holds simplified coastline/border rings (Natural
Earth 1:110m, public domain) used to draw real country outlines on the globe.

## Notes / known data caveats

- BIS marks confidential or missing cells as the literal string `"NaN"` in
  the bulk export, and a small number of cells are negative due to data
  revisions/netting — `fetch_bis.py` filters both out rather than treating
  them as real values.
- BIS reports historical entities (former USSR, Yugoslavia, Czechoslovakia,
  Serbia & Montenegro, Netherlands Antilles) and various "unallocated"
  regional aggregates as pseudo-country codes; `build_snapshot.py` drops any
  edge that doesn't map to a real country in the World Bank node set, which
  removes these automatically.
- World Bank annual indicators (GDP, reserves, external debt) publish with a
  lag, so querying a specific year in isolation (as `fetch_worldbank.py
  --by-year` does) routinely comes back null for the most recent 1-2 years
  even when the data exists and will appear later -- this affected ~40
  countries' 2025 reserves figure at time of writing, including real
  economies like Hong Kong SAR (real reserves ~$425B, silently falling back
  to a ~$4B GDP-derived proxy). `build_snapshot.py --by-year` now applies
  last-observation-carried-forward (capped at 3 years) when merging, so a
  year missing that data uses the most recent prior report instead of
  jumping straight to the model's cruder fallback. `fetch_worldbank.py`'s
  single-snapshot path (`fetch_indicator_latest`, used for
  `out/nodes.json`/`out/network_snapshot.json`) had a related bug: its
  year-range upper bound was a hardcoded constant that goes stale every
  year the pipeline is rerun; it's now derived from today's date.
- Node "equity" (loss-absorbing buffer) for the model uses each country's
  FX reserves, falling back to 1% of GDP, then a floor equal to its own
  bank-capital-to-assets ratio (World Bank `FB.BNK.CAPA.ZS` / IMF Financial
  Soundness Indicators, real coverage ~4-10%) applied to its gross
  cross-border exposure, or the Basel III Pillar 1 minimum (8%) for the
  handful of jurisdictions with no data under any of these indicators, when
  reserves data is missing. The exposure-based floor matters most for
  cross-border financial centres (Isle of Man, Cayman, Luxembourg, Hong
  Kong/Macao SAR, ...), whose BIS-reported banking claims run to multiples
  of local GDP -- without it they saturate the DebtRank impact matrix and
  dominate every shock scenario. See the equityFor() comment in
  web/src/lib/network.ts and web/src/lib/financialCenters.ts (which powers
  an optional "hide financial centers" toggle in the UI) for details.
- FRED's `IRLTLT01` (bond yield) series only covers ~34 mostly-OECD
  economies; `IRSTCI01` (policy rate) and `SPASTT01` (stock index) cover a
  broader ~40, including some non-OECD countries (e.g. Brazil, South
  Africa, Mexico) the bond series doesn't. `fetch_market_data.py` treats a
  404 as "not covered" per series rather than an error, and the web UI
  shows an explicit "no data" note per series instead of hiding the whole
  market-check section when only some series are available.
