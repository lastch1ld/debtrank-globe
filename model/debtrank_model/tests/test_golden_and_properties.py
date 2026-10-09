import json

import numpy as np

from debtrank_model import ExposureNetwork, run_debtrank
from debtrank_model.tests.make_golden import GOLDEN, build_cases


def test_golden_file_is_current():
    # Fails if the model changes without a reviewed regeneration of the file
    # the TS port is checked against.
    assert json.loads(GOLDEN.read_text()) == json.loads(json.dumps(build_cases()))


def _random_net(rng):
    n = int(rng.integers(3, 9))
    exposure = rng.uniform(0, 80, (n, n)) * (rng.random((n, n)) < 0.5)
    np.fill_diagonal(exposure, 0)
    return ExposureNetwork([f"N{i}" for i in range(n)], exposure, rng.uniform(40, 120, n))


def test_distress_properties():
    rng = np.random.default_rng(1)
    for _ in range(50):
        net = _random_net(rng)
        node = net.node_ids[int(rng.integers(net.n))]
        assert not run_debtrank(net, {}).final_distress.any()
        lo, hi = sorted(rng.uniform(0.05, 1, 2))
        a = run_debtrank(net, {node: lo}).final_distress
        b = run_debtrank(net, {node: hi}).final_distress
        assert ((0 <= a) & (a <= 1)).all() and ((0 <= b) & (b <= 1)).all()
        assert (b >= a - 1e-12).all()  # monotone in shock size
