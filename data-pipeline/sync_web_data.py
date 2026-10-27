#!/usr/bin/env python3
"""Copies pipeline output into the web app's two data locations.

`out/` is this pipeline's build output and is not tracked in git — the web
app's copies are, because that is what GitHub Pages serves. Which meant the
propagation between them lived in a handful of `cp` lines in README.md, and
one of them was missing: `network_snapshot.json` was never listed, so the
`bank_capital_ratio_pct` field added in 01c32ee reached `out/` and stopped
there. The app kept falling back to the flat 8% capital ratio that commit
existed to remove, for a month, silently.

So: one command, every derived file, and a report of what actually changed.

Usage:  python sync_web_data.py [--check]

    --check  Report drift and exit non-zero instead of copying. Useful
             after a pipeline run, or in CI, to catch the "regenerated but
             never propagated" case rather than discovering it later.
"""
import argparse
import filecmp
import json
import shutil
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
WEB = Path(__file__).resolve().parent.parent / "web"

# Bundled into the JS bundle at build time (imported by web/src/lib/*.ts).
SRC_DATA = WEB / "src" / "data"
BUNDLED = ["network_snapshot.json", "world_borders.json", "market_data.json", "market_data_source.json"]

# Fetched at runtime by the year scrubber (web/src/lib/network.ts loadYear).
PUBLIC_DATA = WEB / "public" / "data" / "network"


def withdrawn_layer_in(path: Path) -> int:
    """How many edges a year file carries in `portfolio_edges`. The IMF CPIS
    layer was withdrawn (its terms require permission to reuse the data); an old
    local pipeline run can still hold it, and copying that into web/ would
    publish it again."""
    return len(json.loads(path.read_text(encoding="utf-8")).get("portfolio_edges") or [])


def planned_copies() -> list[tuple[Path, Path]]:
    pairs = [(OUT / name, SRC_DATA / name) for name in BUNDLED]
    pairs += [(path, PUBLIC_DATA / path.name) for path in sorted((OUT / "by_year").glob("*.json"))]
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report drift without copying")
    args = parser.parse_args()

    if not OUT.exists():
        print(f"error: {OUT} does not exist — run the pipeline first (see README.md).", file=sys.stderr)
        return 2

    missing_source, stale, copied, refused = [], [], [], []
    for source, target in planned_copies():
        if not source.exists():
            missing_source.append(source)
            continue
        if source.parent.name == "by_year" and (n := withdrawn_layer_in(source)):
            refused.append((source, n))
            continue
        # shallow=False: these are regenerated files, so size and mtime say
        # nothing useful about whether the contents actually differ.
        if target.exists() and filecmp.cmp(source, target, shallow=False):
            continue
        stale.append(target)
        if not args.check:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.append(target)

    for source in missing_source:
        print(f"missing:  {source.relative_to(OUT.parent)} — not generated yet, skipped")
    for source, n in refused:
        print(f"refused:  {source.relative_to(OUT.parent)} has {n} portfolio_edges (the withdrawn IMF CPIS layer); rebuild with build_snapshot.py --by-year")

    if refused:
        print(f"\n{len(refused)} year file(s) refused: publishing them would republish the withdrawn CPIS layer.", file=sys.stderr)
        return 1

    if args.check:
        for target in stale:
            print(f"stale:    {target.relative_to(WEB.parent)}")
        if stale:
            print(f"\n{len(stale)} file(s) differ from pipeline output. Run: python sync_web_data.py")
            return 1
        print("web data is in sync with pipeline output.")
        return 0

    for target in copied:
        print(f"updated:  {target.relative_to(WEB.parent)}")
    print(f"\n{len(copied)} file(s) updated." if copied else "\nAlready in sync — nothing to do.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
