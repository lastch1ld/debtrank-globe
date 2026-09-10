#!/usr/bin/env python3
"""Refresh the World Bank half of the published per-year snapshots in place.

The full pipeline can't run unattended: `fetch_bis.py` needs a ~120MB bulk
CSV that has to be downloaded by hand, so the bilateral banking edges are
frozen between manual runs. That is the reason a scheduled refresh sat open
on the roadmap -- "what should a partial refresh do?" had no obvious answer.

It does have one. **A partial refresh may change the numbers on the graph;
it may never change the graph's shape.** Every node's financial fields come
from the World Bank API and can be re-fetched today. The node roster and
both edge lists come from BIS/CPIS data this job cannot see, and every edge
refers to nodes by id -- so adding or dropping a country here would leave
edges pointing at nodes that no longer exist, or nodes that no edge can
reach. This rewrites the four indicator fields on the existing nodes and
touches nothing else.

That is worth having on its own: the values it refreshes are exactly the
ones World Bank publishes late (see `_last_observation_carried_forward` in
build_snapshot.py -- reserves for the most recent year or two arrive months
after the fact). Without a refresh, the LOCF fix quietly goes stale again
and the app falls back to cruder equity proxies for the year it opens on.

Usage:  python refresh_worldbank.py [--check] [--years 2005:2025]

    --check  Report drift and exit non-zero instead of writing. This is
             what the scheduled workflow runs first to decide whether
             there is anything to open a PR about.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from build_snapshot import FILL_FIELDS, _last_observation_carried_forward
from fetch_worldbank import build_nodes_by_year, fetch_countries

PUBLIC_DATA = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "network"


def refreshed_nodes(existing_nodes: list[dict], fresh_by_id: dict[str, dict], year_str: str) -> list[dict]:
    """The existing nodes with their indicator fields brought up to date.

    Keyed by id and returned in the existing order: the roster is fixed by
    data this job cannot re-derive, so a country the World Bank has since
    added is not added here, and one it no longer returns keeps its last
    published values rather than being silently emptied. `name`/`lat`/`lng`
    are left alone too -- they are display fields the app bundles
    separately, and churning them would put noise in every diff.
    """
    out = []
    for node in existing_nodes:
        fresh = fresh_by_id.get(node["id"])
        if fresh is None:
            out.append(node)
            continue
        values = _last_observation_carried_forward(fresh, year_str)
        out.append({**node, **{field: values.get(field) for field in FILL_FIELDS}})
    return out


def changed_fields(before: list[dict], after: list[dict]) -> list[tuple[str, str]]:
    """(country id, field) pairs whose value actually moved."""
    by_id = {n["id"]: n for n in before}
    return [
        (n["id"], field)
        for n in after
        for field in FILL_FIELDS
        if by_id.get(n["id"], {}).get(field) != n[field]
    ]


def snapshot_years() -> list[int]:
    return sorted(int(p.stem) for p in PUBLIC_DATA.glob("*.json"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="report drift without writing")
    parser.add_argument("--years", metavar="START:END", default=None,
                        help="World Bank year range to fetch (default: the years already published)")
    args = parser.parse_args()

    years = snapshot_years()
    if not years:
        print(f"error: no snapshots found in {PUBLIC_DATA}", file=sys.stderr)
        return 2

    year_range = args.years or f"{years[0]}:{years[-1]}"
    countries = fetch_countries()
    print(f"Fetched {len(countries)} countries", file=sys.stderr)
    fresh_by_id = {n["id"]: n for n in build_nodes_by_year(countries, year_range)}

    total_changes, written = 0, []
    for year in years:
        path = PUBLIC_DATA / f"{year}.json"
        snapshot = json.loads(path.read_text(encoding="utf-8"))

        updated = refreshed_nodes(snapshot["nodes"], fresh_by_id, str(year))
        changes = changed_fields(snapshot["nodes"], updated)
        if not changes:
            continue

        total_changes += len(changes)
        countries_touched = len({c for c, _ in changes})
        print(f"{year}: {len(changes)} value(s) across {countries_touched} countries", file=sys.stderr)
        if not args.check:
            snapshot["nodes"] = updated
            path.write_text(json.dumps(snapshot, separators=(",", ":")), encoding="utf-8")
            written.append(path.name)

    if total_changes == 0:
        print("World Bank values are unchanged; nothing to do.", file=sys.stderr)
        return 0

    if args.check:
        print(f"\n{total_changes} value(s) differ from the World Bank API. "
              f"Run: python refresh_worldbank.py", file=sys.stderr)
        return 1

    print(f"\nUpdated {len(written)} snapshot(s), {total_changes} value(s).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
