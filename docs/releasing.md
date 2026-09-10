# Releasing `debtrank-model`

The package builds and validates on every CI run, so a release is a tag —
but the upload itself needs one piece of setup that only a human with a PyPI
account can do, once.

## One-time: the PyPI trusted publisher

[`publish-model.yml`](../.github/workflows/publish-model.yml) uses PyPI
**trusted publishing** (OIDC) rather than an API token, so there is no
long-lived secret in this repo to leak or rotate. In exchange, PyPI has to be
told which workflow it should trust.

At <https://pypi.org/manage/account/publishing/>, add a **pending publisher**
with exactly these values:

| Field | Value |
| --- | --- |
| PyPI Project Name | `debtrank-model` |
| Owner | `lastch1ld` |
| Repository name | `debtrank-globe` |
| Workflow name | `publish-model.yml` |
| Environment name | `pypi` |

"Pending" is the right kind: the project does not exist on PyPI yet, and the
first successful run creates it.

Then in this repo's **Settings → Environments**, create an environment named
`pypi`. It needs no secrets — the name is half of what PyPI matches on. Adding
a required reviewer to it is worth considering: it turns every release into an
explicit approval instead of a tag push.

## Every release

1. Bump `version` in [`model/pyproject.toml`](../model/pyproject.toml).
   Follow semver against the **public API** — `build_exposure_network`,
   `node_equity`, `run_debtrank`, `Shock`, `clearing_vector`,
   `ExposureNetwork` — not against the web app.
2. Merge that to `master`.
3. Tag the merge commit `model-v<version>` and push the tag:

   ```bash
   git tag model-v0.2.0 && git push origin model-v0.2.0
   ```

The workflow runs the model tests, builds an sdist and a wheel,
`twine check`s both, and uploads. It is deliberately separate from CI: a
push to `master` rebuilds the site and must not be able to ship a release.

## If the upload fails

- **`invalid-publisher`** — the publisher's five fields don't match, or the
  `pypi` environment doesn't exist. Compare against the table above; the
  workflow filename and environment name are the two that get missed.
- **`File already exists`** — that version was already uploaded. PyPI never
  allows re-uploading a version; bump and re-tag.
- Everything before the upload step can be reproduced locally, so a failure
  there is not a publishing problem:

  ```bash
  cd model && python -m build && python -m twine check dist/*
  ```
