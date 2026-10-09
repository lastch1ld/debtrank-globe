#!/usr/bin/env python3
"""Probes every upstream data source with a cheap request and reports what
needs attention. Reads only; it never fetches the data itself.

For each source in sources.json with `probe` set:
  - changed: the upstream version differs from sources.lock.json (or has no
    entry there yet). Only for `change+stale` sources.
  - stale:   the source's own "as of" date is older than `stale_after_days`.

"Version" is an ETag, else Last-Modified, else a hash of the first MB of the
response (`detect.type: header`), or a field of a JSON response
(`detect.type: json`, dotted path). The "as of" date is Last-Modified, or the
JSON field when it is a date, so a source that has quietly stopped updating
shows up as stale even on the first run.

Usage:
    python probe_sources.py                  report, exit 0 (1 if a source could not be probed)
    python probe_sources.py --json           the same, as JSON (used by the workflow)
    python probe_sources.py --update-lock    record what upstream looks like now
    python probe_sources.py --check-registry validate sources.json only, no network
"""
import argparse
import datetime as dt
import email.utils
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REGISTRY = HERE / "sources.json"
LOCK = HERE / "sources.lock.json"

REQUIRED = ("id", "name", "url", "fetch", "may_change", "probe", "cadence", "licence", "attribution")
PROBES = ("change+stale", "stale", "none")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
MAX_HASHED_BYTES = 1_000_000


def validate_registry(registry: dict) -> list[str]:
    """Problems with the registry, empty if it is fine."""
    errors = []
    seen = set()
    for i, s in enumerate(registry.get("sources", [])):
        sid = s.get("id", f"#{i}")
        if sid in seen:
            errors.append(f"{sid}: duplicate id")
        seen.add(sid)
        for field in REQUIRED:
            if not s.get(field):
                errors.append(f"{sid}: missing {field}")
        if s.get("probe") not in PROBES:
            errors.append(f"{sid}: probe must be one of {PROBES}")
        if s.get("probe") in ("change+stale", "stale"):
            if not s.get("detect"):
                errors.append(f"{sid}: a probed source needs `detect`")
            if not isinstance(s.get("stale_after_days"), int):
                errors.append(f"{sid}: a probed source needs integer `stale_after_days`")
            detect = s.get("detect") or {}
            if s.get("detect") and detect.get("type") not in ("header", "json"):
                errors.append(f"{sid}: detect.type must be 'header' or 'json'")
            if detect.get("type") == "json" and not detect.get("path"):
                errors.append(f"{sid}: json detect needs `path`")
    if not registry.get("sources"):
        errors.append("no sources")
    return errors


def get_path(obj, path: str):
    """Dotted lookup that also indexes lists: 'datasets.docs.0.updated_at'."""
    for part in path.split("."):
        if isinstance(obj, list):
            obj = obj[int(part)]
        else:
            obj = obj[part]
    return obj


def http(url: str, method: str = "GET") -> tuple[dict, bytes]:
    """(lower-cased headers, body). The body is capped, and empty for HEAD."""
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "debtrank-globe-probe (+https://github.com/lastch1ld/debtrank-globe)"})
    with urllib.request.urlopen(req, timeout=30) as res:
        headers = {k.lower(): v for k, v in res.headers.items()}
        body = b"" if method == "HEAD" else res.read(MAX_HASHED_BYTES)
    return headers, body


def _date_from_http(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return email.utils.parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError):
        return None


def observe(source: dict, fetch=http) -> dict:
    """What upstream looks like now: {"value", "as_of", "how"}."""
    detect = source["detect"]
    if detect["type"] == "json":
        _, body = fetch(source["url"], "GET")
        value = str(get_path(json.loads(body), detect["path"]))
        return {"value": value, "as_of": value[:10] if DATE.match(value) else None, "how": "json"}

    headers, _ = fetch(source["url"], "HEAD")
    as_of = _date_from_http(headers.get("last-modified"))
    if headers.get("etag"):
        return {"value": headers["etag"], "as_of": as_of, "how": "etag"}
    if headers.get("last-modified"):
        return {"value": headers["last-modified"], "as_of": as_of, "how": "last-modified"}
    _, body = fetch(source["url"], "GET")
    return {"value": hashlib.sha256(body).hexdigest(), "as_of": None, "how": "sha256"}


def evaluate(source: dict, observed: dict, lock_entry: dict | None, today: dt.date) -> dict:
    """The verdict on one source."""
    as_of = observed["as_of"]
    age = (today - dt.date.fromisoformat(as_of)).days if as_of else None
    stale = age is not None and age > source["stale_after_days"]
    unlocked = source["probe"] == "change+stale" and lock_entry is None
    changed = source["probe"] == "change+stale" and (unlocked or lock_entry["value"] != observed["value"])
    return {
        "id": source["id"],
        "name": source["name"],
        "probe": source["probe"],
        "changed": changed,
        "unlocked": unlocked,
        "stale": stale,
        "as_of": as_of,
        "age_days": age,
        "stale_after_days": source["stale_after_days"],
        "version": observed["value"],
        "how": observed["how"],
        "fetch": source["fetch"],
    }


def run(registry: dict, lock: dict, today: dt.date, fetch=http, only: set[str] | None = None) -> tuple[list[dict], list[dict], dict]:
    """(verdicts, errors, observations by id). A source that cannot be probed is
    an error and does not stop the others."""
    verdicts, errors, observations = [], [], {}
    for source in registry["sources"]:
        if source["probe"] == "none" or (only and source["id"] not in only):
            continue
        try:
            observed = observe(source, fetch)
        except Exception as exc:  # noqa: BLE001 - any failure of one source is reported, not fatal
            errors.append({"id": source["id"], "error": f"{type(exc).__name__}: {exc}"})
            continue
        observations[source["id"]] = observed
        verdicts.append(evaluate(source, observed, lock.get("sources", {}).get(source["id"]), today))
    return verdicts, errors, observations


def updated_lock(registry: dict, lock: dict, observations: dict, today: dt.date) -> dict:
    sources = dict(lock.get("sources", {}))
    for source in registry["sources"]:
        obs = observations.get(source["id"])
        if obs and source["probe"] == "change+stale":
            sources[source["id"]] = {**obs, "observed_at": today.isoformat()}
    return {"sources": sources}


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--update-lock", action="store_true")
    parser.add_argument("--check-registry", action="store_true")
    parser.add_argument("--only", help="comma-separated source ids")
    args = parser.parse_args(argv)

    registry = load(REGISTRY, {})
    problems = validate_registry(registry)
    if problems:
        print("sources.json is invalid:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 2
    if args.check_registry:
        return 0

    lock = load(LOCK, {"sources": {}})
    today = dt.date.today()
    only = set(args.only.split(",")) if args.only else None
    verdicts, errors, observations = run(registry, lock, today, only=only)

    if args.update_lock:
        LOCK.write_text(json.dumps(updated_lock(registry, lock, observations, today), indent=2) + "\n", encoding="utf-8", newline="\n")

    if args.json:
        print(json.dumps({"today": today.isoformat(), "results": verdicts, "errors": errors}, indent=2))
    else:
        for v in verdicts:
            flags = [f for f, on in (("CHANGED", v["changed"]), ("STALE", v["stale"])) if on]
            note = " (no baseline in the lock)" if v["unlocked"] else ""
            age = f"{v['age_days']}d old" if v["age_days"] is not None else "age unknown"
            print(f"{v['id']:<22} {age:<14} {' '.join(flags) or 'ok'}{note}")
        for e in errors:
            print(f"{e['id']:<22} ERROR {e['error']}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
