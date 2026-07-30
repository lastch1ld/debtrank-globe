"""Fetch simplified country border outlines for the globe visualization.

Source: Natural Earth 1:110m admin-0 countries (public domain), via the
nvkelso/natural-earth-vector GeoJSON mirror. We only need the silhouette for
a 3D globe rendered at a modest size, so this strips everything down to
[lng, lat] rings per country (dropping inner holes/lakes and all metadata)
and decimates points that are closer together than ~0.4 degrees.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)


def simplify_ring(ring: list[list[float]], tolerance: float = 0.4) -> list[list[float]]:
    if len(ring) <= 3:
        return ring
    out = [ring[0]]
    for pt in ring[1:]:
        last = out[-1]
        if abs(pt[0] - last[0]) + abs(pt[1] - last[1]) >= tolerance:
            out.append(pt)
    if out[-1] != ring[-1]:
        out.append(ring[-1])
    return out


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "out" / "world_borders.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    resp = requests.get(SOURCE_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    countries = []
    for feature in data["features"]:
        geom = feature["geometry"]
        name = feature["properties"].get("ADMIN") or feature["properties"].get("NAME")
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings = []
        for poly in polys:
            outer = poly[0]  # drop inner rings (lakes) -- silhouette only
            ring = simplify_ring([[round(lng, 2), round(lat, 2)] for lng, lat in outer])
            if len(ring) >= 3:
                rings.append(ring)
        if rings:
            countries.append({"name": name, "rings": rings})

    out_path.write_text(json.dumps({"countries": countries}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(countries)} country outlines to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
