# Publication assurance and final three presentation fixes — candidate

Baseline: public site e10214c62167a3f8e426d021cc289de2dda53229.

## Presentation scope

1. The homepage run strip inherits terminal colors, separates the replay minute from the full-run outcome, and moves the complete run identity into native details. Existing report, replay, source and comparison handoffs retain their exact run identity.
2. Lab leads with the existing public Algothon case and report/code links. Its vague verification stamp is replaced with publication context. Existing private-resource and execution boundaries remain in native expandable details.
3. IDE folds full source digests and engine specifications with native details. Draft state, result/source attribution, error feedback, exact source export and local execution requirements remain visible. An import map selects the SHA-pinned derivative studio module; original runtime and presentation-copy modules are retained byte-for-byte.

Run the existing P1, P2, copy and four-fix generators first, then `python scripts/apply_public_polish.py`. All remain idempotent. The production verifier covers the new assets under `publicPolish`; existing manifests continue to own page digests so later catalogue changes do not create conflicting hashes.

## Data and result assurance

`python scripts/verify_publication.py --output qa/publication-audit.json` checks all 30 exported tapes, published Python source bytes and all 15 on_bar ledgers. It reconstructs cash, positions, fees, net equity, drawdown and the declared benchmark from the retained fills and prices. It separately reconciles the published quote-strategy ledger. Mutation tests reject invalid observations, wrong source/tape identity, incorrect balances/fees and impossible next-open fills. Baseline whole-file SHA checks preserve original public inputs.

This is internal publication consistency, NOT a rerun of the producing Python runtime, verification of synthetic queue behavior, external data authentication or proof of predictive performance. Historical data remains the retained 10 September 2026 session; no new trading days or live data are introduced.

## Source checkpoint dependency

The producing source checkpoint recorded by the public release could not be resolved in the currently connected source repository on 21 September 2026. That repository's available runtime digests differ from those declared in the published records. Current-source engine fixes and reproducibility checks are a separate private PR; do not export them over this public engine or replace the 15 published results until the exact producing source is recovered and reconciled.

This candidate does not merge or deploy itself. Its workflow collects full regression logs, narrow/desktop screenshots and semantic publication evidence before recording generated output on the named candidate branch.
