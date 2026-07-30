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

# 4. Copy into the web app's static data dir, served at runtime via fetch()
cp out/by_year/*.json ../web/public/data/network/
```

### Bond-yield market check

```bash
# FRED 10Y government bond yield equivalents, no API key needed (public CSV export).
# Coverage is OECD-centric -- non-covered countries are simply omitted.
python fetch_bond_yields.py out/bond_yields.json

cp out/bond_yields.json ../web/src/data/bond_yields.json
```

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
- Node "equity" (loss-absorbing buffer) for the model uses each country's
  FX reserves, falling back to 1% of GDP, then a small floor, when reserves
  data is missing.
- FRED's `IRLTLT01` long-term interest rate series only covers ~35-40
  mostly-OECD economies (confirmed 404 for Brazil, India, China, and most
  smaller/developing countries) — `fetch_bond_yields.py` treats a 404 as
  "not covered" rather than an error, and the web UI shows an explicit
  "no data" note for uncovered countries instead of hiding the section.
