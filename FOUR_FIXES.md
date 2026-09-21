# First four audit fixes — candidate

Approved scope: mobile-home research access; P.Book mobile navigation; consistent
case counts; explicit Profile statistical comparators. No changes to the terminal
run information bar, overall Lab/IDE information hierarchy, engine, tape data,
submitted strategy sources or published results.

## Implementation

- The phone Lab card contains the existing Algothon case, report and code links.
  Its note distinguishes remaining private research notes from this public case.
- At widths up to 700px, Overview/Trading/IDE and Historical/Synthetic occupy
  separate rows. All five links retain their original route and active-state
  behavior, with 44px-high targets. Desktop navigation remains one row.
- `scripts/public_case_catalogue.json` is the shared build-time catalogue for the
  desktop-home list, phone count and Lab table/count. PXA and ETF pricing are
  separate archives. Existing public anchors are preserved. No browser fetch is
  needed to access the catalogue or research links.
- Profile's Evaluation summary binds 3.7 points to second place and approximately
  0.4 of one block's standard error to the public-data replay mean in separate
  statements. The underlying results and research limitations are untouched.

## Reproduction

Run `python scripts/apply_public_four_fixes.py` after the existing P1, P2 and
presentation-copy generators. Preserve the catalogue, stylesheet, generator and
tests when refreshing the upstream public export. Unexpected HTML structures or
modified retained runtime inputs stop generation before any output is written.
`release.json.publicFourFixes` records the new page/style checksums; the existing
release verifier also checks this group.

```sh
python scripts/apply_public_four_fixes.py --check
python tests/four_fixes_acceptance.py
python tests/four_fixes_generator_test.py
python tests/four_fixes_browser.py
```

The candidate workflow first reproduces the four browser regressions on the
unmodified published pages, then generates the fixes and runs the new journeys
plus all existing static, Node and browser regressions. It collects 320px, 390px
and desktop screenshots, layout measurements, keyboard/market-switch checks,
no-JavaScript checks and dark-mode/resize coverage. The editing container blocks
localhost browser navigation; browser acceptance therefore runs in GitHub Actions.

The workflow can record accepted output only on the named candidate branch.
It never merges or deploys. Merge requires separate approval, followed by the
existing exact-commit production verifier.
