# Presentation copy — candidate, not yet released

Scope approved in the website conversation: make the work the primary message;
retain clear synthetic/historical labels, move full simulation rules into native
expandable details, and keep Python's browser/local boundary explicit.

## User-facing changes

- Home terminal: `Historical prices · Simulated trading` on desktop and mobile.
- Synthetic Trading/Overview: `Synthetic prices · Simulated trading`.
- Historical Trading/Overview: `Historical prices · Simulated trading`.
- Profile, Lab and IDE: short mixed-market simulation labels. P.Book's description
  introduces an interactive trading simulator rather than a long disclaimer.
- `Data & simulation details` retains Yahoo Finance's retained session date,
  390 bars, P.Book-generated synthetic prices, contract-metadata attribution,
  simulated order book/accounts/results and no real order placement.
- Training's single general usage note retains `not investment advice` and the
  local Python execution boundary. Browser drafts/exports remain distinguished
  from published results. Actual Optibook competition/project descriptions and
  research/statistical limitations are unchanged.

## Reproducible public build

The accessible repository is an exported public snapshot. Original `assets/`
and `data/` are SHA-256-pinned in `scripts/presentation_copy.json` and stay
byte-identical. The copy generator derives four browser UI modules under
`portfolio-assets/`, changing only reviewed message strings and import paths;
unchanged original CSS is referenced from `assets/`. New module URLs prevent an
old cached entry from mixing with new dependencies. There is no DOM text-scraping
or CSS concealment of warnings, no alteration of strategy code or run data, and
no private-source rebuild is claimed. Upstream exports with different input
hashes must be reviewed, not silently patched.

Run after the existing P1/P2 export steps:

```sh
python scripts/apply_public_copy.py
python scripts/apply_public_p1.py --check
python scripts/apply_public_p2.py --check
python scripts/apply_public_copy.py --check
python tests/copy_acceptance.py
python tests/copy_browser.py
```

`release.json.publicCopy` records the new page/module hashes. The live verifier
also validates that group. When refreshing the private upstream project, port
these messages to its source components and replace the derived modules with a
normal export; until then preserve the copy map and generator.

## Acceptance and release boundary

The workflow checks static copy contracts, immutable inputs, all current P1/P2
regressions and closeout cases, native details with keyboard/without JavaScript,
market switching, report/replay/IDE routes, local-source wording and mobile
layouts. Browser evidence is collected in GitHub Actions because this editing
container blocks localhost navigation. Candidate acceptance is not deployment;
merge only with explicit authorization, then verify the exact deployed commit.
