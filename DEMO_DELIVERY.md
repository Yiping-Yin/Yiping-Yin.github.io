# Lightweight public demonstration — candidate

Approved scope: four small improvements to the existing GitHub Pages experience.
No backend, browser Python runtime, new market data or replacement strategy runs.
The additional personal-introduction and mobile-Lab typography ideas are deferred.

## Changes

1. Home's general P.Book/Trading/Strategies entrances preserve historical-market context. Existing exact-run links and the secondary synthetic desk remain available.
2. Strategies replaces the public IDE label. Source is read-only initially, with an explicit Edit/Done control on desktop and phone. Draft saving, restore, exact `.py` export and original-result attribution remain. Local execution instructions move into native details.
3. Home presents the trend, one-unit hold and opening-range examples on the same retained AAPL tape. Examples are selected by method, not return. All 15 records, the two original responsive tables and execution rules remain in native details; the existing `/#published-runs` deep link opens the archive.
4. Strategy selection synchronizes its `source` URL parameter without changing market context or unrelated fragment parameters. Click/keyboard selection, reload, sharing and native Back/Forward preserve the selected source and per-strategy drafts.

## Reproduction and safeguards

Run `python scripts/apply_public_demo.py` after the existing P1/P2/copy/four-fix/polish generators. Original compiled modules and all immutable public data remain byte-for-byte unchanged; pinned presentation derivatives share one React module through the import map. All generators support `--check`. Unknown source inputs or mismatched selected-run settings fail before output is written.

The generator also adapts only prior browser assertions superseded by the approved label, read-first state and folded local instructions. Other assertions and all numeric/data checks remain in force. `release.json.publicDemo` records the new assets, while existing manifest groups continue to own page digests.

Baseline browser evidence: GitHub Actions run `35588634993` reproduced four expected failures, including a HOLD selection leaving `source=trend` in the URL. Candidate acceptance covers static/unit/publication checks plus all previous browser suites, with 320px, 390px and desktop screenshots. Test evidence is not a claim of production deployment.

The candidate workflow can record generated output only on `upgrade/lightweight-demo-20260921`, only after its tests pass. It does not merge or deploy. Merge approval and the exact-commit production verifier are still required.
