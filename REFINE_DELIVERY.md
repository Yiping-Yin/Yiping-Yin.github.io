# Portfolio refinements — candidate, not deployed

Approved scope: carry the existing blue-white homepage into current main; compact the phone terminal; remove duplicate Profile comparisons and repair action/count copy; stop Trading replay on page hide, requiring explicit resume.

Base: `db4c7e336231c86d3dc564527d8fdf7af24200ee`, tree `56b4f36296379add7d633f0ba75ac52b5b14e4ca`. Local source snapshot was verified against this complete tree. The base stylesheet and identity markup come from PR #10, commit `d88603805578bb15add2857e27701810dd8291e9`; its stylesheet blob `a080ec8749931057aa4e48f04c5d82052ea25ed9` is unchanged. This candidate carries those presentation assets onto the newer main, not the obsolete trial's generated HTML or release manifest. PR #10 itself is not merged or changed.

## Reproduction

Run `python scripts/apply_public_refine.py` after the existing public generators. `--check` must pass on committed outputs. The script stages and validates changes before writing, pins its replay input, and updates existing manifest owners without duplicating shared HTML ownership. Original assets, data, terminal runtime, quality-model/UI and published results remain unchanged. The refined replay is a derivative whose only code difference is the interval effect.

Existing test changes cover only superseded action labels, singular fill wording and the exact market derivative URL. Existing financial, source, navigation, share and layout assertions remain in place. The browser suite uses headed Chromium under `xvfb-run` for actual background-tab visibility, not a mocked `document.hidden`. The workflow first reproduces all four findings on the exact base, then runs candidate and retained tests and records outputs on this candidate branch only. PR verification checks committed outputs without regenerating them.

The local editing environment blocks browser requests to preview URLs. Local static/Node verification is distinct from browser verification in GitHub Actions; no local or production-browser pass is claimed. Evidence from this candidate must be reviewed before approval to merge. No automatic merge, Pages deployment, back end, Python execution, credentials, market feeds or account uploads are introduced.
