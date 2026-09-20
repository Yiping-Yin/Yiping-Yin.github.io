# Public P1 integration

Scope: UPGRADE_PLAN.md P1-01, P1-02 and P1-03. P2 is not included.

Baseline: public Pages artifact at ab5dba4e7af2e19854fc133998dff3e7d84b6f98.
The accessible PBook/main does not contain the deployed source checkpoint.
This is therefore an explicitly separate public post-export enhancement, not a
rebuild or a claimed update of the private/local Python application.

## Reproduce

Keep scripts/apply_public_p1.py, portfolio-assets/source-export.mjs and
portfolio-assets/p1-evidence.css when refreshing the public export. Then run:

```sh
python scripts/apply_public_p1.py
python scripts/apply_public_p1.py --check
python tests/p1_acceptance.py
node --test tests/source-export.test.mjs
# Real browser gate (requires local HTTP navigation):
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium
python tests/p1_browser.py
```

The transformer requires exact existing public markers and stops on mismatch.
It computes all changed pages before writing and is idempotent. It preserves
existing section IDs, compiled bundles, engine logic, market tapes, published
runs, source digests and privacy boundaries. release.json retains the original
source provenance and adds separately labelled publicEnhancements checksums.

IDE export uses the live textarea value in the active source panel. It does not
read localStorage, choose a fallback source, execute Python, or alter any run.
It is a progressive enhancement of the public textarea interface, tested on
route changes, strategy tabs, edits, reload, empty drafts, errors and keyboard
activation. Port this feature into the matching source component when that
source checkpoint is available; do not overwrite this branch using an old export.

The branch-only workflow builds and tests the candidate before writing generated
HTML back to the same branch. It never pushes main or deploys production.
A merge and a separate Pages deployment verification are required for release.
The original 427 Node / 95 Python test claims in UPGRADE_PLAN belong to the
previous release; they are not claims about tests run for this public change.
