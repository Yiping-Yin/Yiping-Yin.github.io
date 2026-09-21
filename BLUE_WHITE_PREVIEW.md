# Blue-white homepage candidate

User-approved trial of the proposed personal research presentation, inspired by blue/white editorial hierarchy rather than a copy of Man Group branding.

## Scope

Compact static name/role and two native links before the existing full-width navy terminal. Light presentation grounds in light mode, preserved system/manual dark-mode choice, more legible method-led strategy summaries, restrained credentials and aligned spacing. No new font, image, JavaScript, dependency or backend in the public page. No changes to prices, trades, outcomes, chart internals, workspaces, routes or existing disclosures.

## Reproduce

Run `python scripts/apply_public_visual.py` **after** the existing public enhancement generators. Use `--check` to check the committed output. The transform is reversible and refuses unknown source structures. Its stylesheet is scoped to the homepage. The existing release verifier checks the new CSS/HTML hashes too.

Preview with the static HTTP server documented in README. Run `python tests/visual_generator_test.py`, `python tests/visual_acceptance.py` and `python tests/visual_browser.py`. The new workflow also runs the prior static, Node and browser regression suites. Its `blue-white-home-evidence` artifact contains desktop/mobile screenshots in both themes and detailed results. Artifacts expire after 14 days; they are review evidence, not a hosted preview.

The workflow may record tested generated files only on `design/blue-white-home-20260921`. It does not merge, deploy or write to `main`. The public website stays unchanged until a separate merge approval.
