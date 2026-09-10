# debtrank-model

DebtRank (Battiston, Puliga, Kaushik, Tasca & Caldarelli, 2012) and the
Eisenberg–Noe (2001) clearing model, implemented over cross-border sovereign
debt exposure networks.

Both are tested against the toy examples in the original papers. This package
is the reference implementation behind
[debtrank-globe](https://github.com/lastch1ld/debtrank-globe), whose TypeScript
port is kept structurally identical and checked against the same fixtures.

```bash
pip install debtrank-model
```

## Use it as a library

```python
import json
from debtrank_model import build_exposure_network, run_debtrank, clearing_vector

with open("2020.json") as f:                 # a network snapshot, see below
    snapshot = json.load(f)

network = build_exposure_network(snapshot)   # add include_portfolio=True for the CPIS layer
result = run_debtrank(network, {"GRC": 1.0, "PRT": 0.6})

print(result.debtrank)                       # aggregate impact, equity-weighted
for node_id, distress in sorted(
    zip(result.node_ids, result.final_distress), key=lambda x: -x[1]
)[:5]:
    print(node_id, round(distress, 4))
```

`build_exposure_network` is public on purpose. The algorithm alone doesn't
determine what a DebtRank number means — the equity fallback chain does
(reserves → 1% of GDP → the country's own bank-capital ratio against its
gross cross-border footprint → a floor). Two callers who build their networks
differently are not running the same model, so the construction ships with
the algorithm rather than being left as an exercise.

## Use it from the command line

```bash
debtrank-simulate 2020.json --shock GRC=1.0 --shock PRT=0.6
debtrank-simulate 2020.json --shock USA=0.6 --include-portfolio
```

Repeat `--shock` to shock several countries simultaneously.

## Snapshot format

A JSON object with `nodes`, `edges`, and optionally `portfolio_edges`:

```json
{
  "nodes": [{"id": "GRC", "gdp_usd": 1.9e11, "reserves_usd": 1.0e10,
             "external_debt_usd": null, "bank_capital_ratio_pct": 6.4}],
  "edges": [{"creditor": "FRA", "debtor": "GRC", "amount": 4.2e10}],
  "portfolio_edges": [{"creditor": "DEU", "debtor": "GRC", "amount": 1.1e10}]
}
```

`edges` are BIS bilateral banking claims (creditor holds a claim on debtor);
`portfolio_edges` are IMF CPIS bond/equity holdings, a largely distinct
contagion channel, off unless asked for.

Ready-made snapshots for every year from 2005 to 2025 are published at
`https://lastch1ld.github.io/debtrank-globe/data/network/{year}.json` —
see [the data reference](https://github.com/lastch1ld/debtrank-globe/blob/master/docs/data-api.md)
for the schema, sources, and attribution terms.

## License

MIT.
