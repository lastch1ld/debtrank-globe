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
```

Output: `out/network_snapshot.json` — `{"nodes": [...], "edges": [...]}`,
~4,400 real bilateral country-country exposure edges across ~215 countries.

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
