#!/usr/bin/env python3
"""Turns probe_sources.py's JSON into GitHub issues, one per source and
problem, never a second one for something already open.

    python probe_issues.py probe.json --exit-code 0 [--dry-run]

Issues are labelled `data-changed`, `data-stale` and `data-refresh-failed`.
Nothing closes them: a person does that once the data has been refreshed (or
the staleness accepted). While one is open, later runs stay quiet about that
source instead of commenting every week.
"""
import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

LABELS = {
    "data-changed": ("0E8A16", "An upstream data source has a newer version than the committed data"),
    "data-stale": ("FBCA04", "An upstream data source has not updated for longer than expected"),
    "data-refresh-failed": ("B60205", "The weekly data probe could not run or could not reach a source"),
}


@dataclass(frozen=True)
class Issue:
    label: str
    title: str
    body: str


def plan_issues(report: dict | None, exit_code: int) -> list[Issue]:
    """The issues this probe result calls for. `report` is None when the probe
    died before printing any JSON."""
    if report is None or exit_code not in (0, 1):
        return [
            Issue(
                "data-refresh-failed",
                "Data probe failed",
                f"`data-pipeline/probe_sources.py` exited with code {exit_code} and printed no usable report. See the workflow run's log.",
            )
        ]
    issues = []
    for r in report["results"]:
        if r["changed"]:
            why = (
                "There is no baseline for it in `data-pipeline/sources.lock.json`, so the version the committed data came from is unknown."
                if r["unlocked"]
                else "Its upstream version differs from the one in `data-pipeline/sources.lock.json`."
            )
            issues.append(
                Issue(
                    "data-changed",
                    f"Source changed: {r['name']}",
                    f"{why}\n\n- upstream version: `{r['version']}` (read from the {r['how']})\n- as of: {r['as_of'] or 'unknown'}\n- refresh with: `data-pipeline/{r['fetch']}`, then `python probe_sources.py --update-lock` in the same commit\n\nThe automated rebuild is not built yet (see `docs/plans/2026-09-23-automated-data-refresh.md`, Phase 2), so this refresh is manual. Close this issue once it is done.",
                )
            )
        if r["stale"]:
            issues.append(
                Issue(
                    "data-stale",
                    f"Source stale: {r['name']}",
                    f"Its own as-of date is {r['as_of']}, {r['age_days']} days ago; the registry expects it to update within {r['stale_after_days']} days.\n\nThe source may have moved or stopped (see `docs/plans/2026-09-23-automated-data-refresh.md`, finding 2, for the CPIS mirror). Check upstream, then either point `data-pipeline/{r['fetch']}` at the new location or raise `stale_after_days` in `data-pipeline/sources.json`.",
                )
            )
    for e in report["errors"]:
        issues.append(
            Issue(
                "data-refresh-failed",
                f"Data probe could not reach {e['id']}",
                f"`{e['error']}`\n\nIf this persists, the source's URL or format has probably changed: check `data-pipeline/sources.json`.",
            )
        )
    return issues


def new_issues(issues: list[Issue], open_titles: dict[str, set[str]]) -> list[Issue]:
    """Drop the issues whose exact title is already open under the same label."""
    return [i for i in issues if i.title not in open_titles.get(i.label, set())]


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def open_titles_by_label() -> dict[str, set[str]]:
    out = {}
    for label in LABELS:
        listing = json.loads(gh("issue", "list", "--label", label, "--state", "open", "--limit", "100", "--json", "title") or "[]")
        out[label] = {i["title"] for i in listing}
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("report", type=Path)
    parser.add_argument("--exit-code", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = None
    wanted = plan_issues(report, args.exit_code)

    if args.dry_run:
        for i in wanted:
            print(f"[dry run] would open under `{i.label}`: {i.title}")
        if not wanted:
            print("[dry run] nothing to open")
        return 0

    todo = new_issues(wanted, open_titles_by_label())
    for label, (color, description) in LABELS.items():
        if any(i.label == label for i in todo):
            subprocess.run(["gh", "label", "create", label, "--color", color, "--description", description], capture_output=True)
    for i in todo:
        print(gh("issue", "create", "--label", i.label, "--title", i.title, "--body", i.body).strip())
    print(f"{len(todo)} opened, {len(wanted) - len(todo)} already open")
    return 0


if __name__ == "__main__":
    sys.exit(main())
