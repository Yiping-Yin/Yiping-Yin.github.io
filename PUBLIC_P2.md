# Public P2 maintenance

This is a read-only public post-export enhancement on top of merged P1 (`e56b1d1`). It does not rebuild or modify the separately maintained P.Book runtime. Preserve the P1/P2 scripts, tests, documentation, workflows and added `portfolio-assets/` modules when refreshing exported assets.

## Regeneration

After exporting a compatible public P.Book snapshot, run:

```sh
python scripts/apply_public_p1.py
python scripts/apply_public_p2.py
python scripts/apply_public_p1.py --check
python scripts/apply_public_p2.py --check
python tests/p1_acceptance.py
python tests/p2_acceptance.py
node --test tests/source-export.test.mjs tests/comparison.test.mjs
python tests/p1_browser.py
python tests/p2_browser.py
```

Browser checks use Python Playwright 1.57.0 and Chromium. The generator rejects missing P1 markup, unexpected hero identities and a changed 15-run set; do not silence these checks when updating a snapshot. Review the integration when the upstream format changes. Both generators are idempotent on the final public pages.

## Page contracts

- `research-algothon.html`: public team evidence pinned to Algothon repository commit `eac4ec5593808008d9af90ceaa5b3ec45669503e`. General-round `final2.py` and Final-round `abc123.py` remain distinct. The case figure compares reported score quantities on a common scale; it is not a confidence interval, fresh model evaluation or investment return.
- `compare.html?a=<runId>&b=<runId>`: browser-only comparison of existing on_bar records. The URL preserves selections through reload and history; omitted selections default deterministically, unknown IDs remain visible errors. The market account and local IDE drafts are not read or written.
- Home: the current-run evidence strip and 15-run table follow the hero's published run identity when its instrument changes. Report/replay/source links preserve market and task. The terminal's existing execution/replay code is unchanged.

## Evidence and rendering

The comparator verifies both published data files against `release.json`, checks each source digest, decodes only the documented six-number v1 equity tuples and independently reconciles recorded summaries with the full path/fills. It rejects differences in symbol, tape, time window, unit, initial capital, execution policy, runtime source digests, costs, position limits or benchmark. Missing matching evidence does not count as equality.

The SVG contains all 390 recorded observations, with no smoothing or resampling. A is solid, B dashed and the common benchmark dotted. Equity includes idle cash; the y-axis is fitted and labelled in USD or SIM. Every numerical difference is B minus A, with return/drawdown differences in percentage points. Minute labels use the source bar's open time; values are completed-bar equity. Slider and full HTML table provide keyboard/touch access without hover.

`release.json.publicP2` records the new public files separately from original tape, runtime and hero provenance. P1 page hashes are updated for shared pages. Original trading bundles, data and published runs must remain byte-identical unless separately reviewed.

## Delivery boundary

The branch workflow generates and tests pages before recording them on the candidate branch. It never merges or writes `main`. A reviewed PR merge and a successful Pages deployment are separate from candidate acceptance. Check the exact deployed commit and the `publicP2.files` HTTP content hashes after publishing, before marking roadmap items as released.
