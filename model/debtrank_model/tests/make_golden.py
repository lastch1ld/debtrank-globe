"""Regenerate golden/debtrank_cases.json: seeded random networks plus the
Python model's results. The TS port (web/src/lib/golden.test.ts) must match
these. Regenerating is a deliberate, reviewed step:

    python -m debtrank_model.tests.make_golden
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from debtrank_model import ExposureNetwork, Shock, run_debtrank

GOLDEN = Path(__file__).parent / "golden" / "debtrank_cases.json"


def build_cases() -> list[dict]:
    rng = np.random.default_rng(20260923)
    cases = []
    for k in range(8):
        n = int(rng.integers(3, 9))
        exposure = rng.uniform(0, 80, (n, n)) * (rng.random((n, n)) < 0.5)
        np.fill_diagonal(exposure, 0)
        equity = rng.uniform(40, 120, n)
        ids = [f"N{i}" for i in range(n)]
        shocks = {
            ids[int(i)]: {"level": round(float(rng.uniform(0.2, 1)), 3), "delay": int(rng.integers(0, 3))}
            for i in rng.choice(n, size=int(rng.integers(1, 3)), replace=False)
        }
        net = ExposureNetwork(ids, exposure, equity)
        res = run_debtrank(net, {i: Shock(**s) for i, s in shocks.items()})
        cases.append({
            "nodeIds": ids,
            "exposure": exposure.tolist(),
            "equity": equity.tolist(),
            "shocks": shocks,
            "finalDistress": res.final_distress.tolist(),
            "debtrank": res.debtrank,
        })
    return cases


if __name__ == "__main__":
    GOLDEN.write_text(json.dumps(build_cases(), indent=1) + "\n")
