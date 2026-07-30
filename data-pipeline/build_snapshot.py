"""Merge World Bank node attributes and BIS bilateral edges into a single
network snapshot (ISO3-keyed) that model/ and web/ both consume.

BIS edges are keyed by ISO2 country code; World Bank nodes are keyed by
ISO3. This joins them via the World Bank country list's iso2Code field,
dropping any edge where either side isn't a real country in our node set
(this is what naturally filters out BIS's aggregate/regional codes like
"5J" All countries, "2B" Unallocated emerging Europe, etc, without needing
to hardcode every aggregate code).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    base = Path(__file__).parent / "out"
    nodes_path = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "nodes.json"
    edges_path = Path(sys.argv[2]) if len(sys.argv) > 2 else base / "edges.json"
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else base / "network_snapshot.json"

    nodes = json.loads(nodes_path.read_text(encoding="utf-8"))["nodes"]
    edges_raw = json.loads(edges_path.read_text(encoding="utf-8"))["edges"]

    # World Bank fetch doesn't currently keep iso2 -- refetch the mapping cheaply
    # from the same country list source used by fetch_worldbank.py.
    import requests

    resp = requests.get(
        "https://api.worldbank.org/v2/country",
        params={"format": "json", "per_page": 400},
        timeout=30,
    )
    resp.raise_for_status()
    _, countries = resp.json()
    iso2_to_iso3 = {c["iso2Code"]: c["id"] for c in countries if c["region"]["id"] != "NA"}

    iso3_with_node = {n["id"] for n in nodes}

    edges = []
    dropped = 0
    for e in edges_raw:
        creditor_iso3 = iso2_to_iso3.get(e["creditor"])
        debtor_iso3 = iso2_to_iso3.get(e["debtor"])
        if not creditor_iso3 or not debtor_iso3:
            dropped += 1
            continue
        if creditor_iso3 not in iso3_with_node or debtor_iso3 not in iso3_with_node:
            dropped += 1
            continue
        edges.append({
            "creditor": creditor_iso3,
            "debtor": debtor_iso3,
            "period": e["period"],
            "amount": e["amount"],
        })

    snapshot = {"nodes": nodes, "edges": edges}
    out_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"{len(edges)} edges kept, {dropped} dropped (aggregates/unmapped) -> {out_path}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
