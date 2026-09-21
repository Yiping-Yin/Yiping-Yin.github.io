# Public demonstration quality — candidate

Approved scope: four small follow-ups to the public GitHub Pages demonstration,
based on the accepted `083ca17` tree. No backend, online Python, new datasets,
account export, new pages, personal-introduction section or background-playback
policy is introduced. Merge and publication require separate approval.

## Changes

1. General navigation links keep historical context throughout Home, Profile,
   Lab, comparison, the research case and recovery page. Strategies is the
   navigation label; run-specific buttons say View source. Legacy addresses and
   explicit synthetic or exact-run links still work.
2. Report drawdown annotations use the largest chronological percentage decline
   from a preceding equity high, including initial cash. Earliest equal intervals
   are chosen deterministically. Zero drawdown has no fabricated marker pair.
   All 15 original reported percentages reconcile. Eight nonzero runs previously
   had an unrelated whole-session extreme in the displayed pair. The original
   published results, source bytes, fills and prices are not replaced.
3. Share this moment pauses playback and copies a public-only link containing
   market, run ID, tape checksum and one-based minute. A fresh browser opens that
   exact moment paused. Missing clipboard permission exposes a selectable link;
   malformed, duplicate, wrong-tape or out-of-range parameters are rejected with
   feedback. Old links preserve the existing cursor behaviour. No draft, local
   account or other query data is included in a shared link.
4. Narrow-screen Lab and report prose is enlarged; strategy source reading and
   editing use larger type. Wide report tables scroll inside keyboard-focusable
   regions, with their columns retained instead of shrinking the whole page.

## Reproduction and boundaries

Run `python scripts/apply_public_quality.py` after the existing public generators.
Pinned upstream presentation modules and all immutable runtime/data inputs are
checked before any output is written. The additional derivatives resolve to a
single React runtime through the import map. All prior generators retain their
`--check` path; only superseded module-entry and navigation expectations are adapted.

The quality workflow reproduces four browser failures on the exact accepted
baseline, runs all static, JavaScript and browser regressions, and retains logs,
screenshots and a 15-run drawdown audit. PR runs check committed files without
silently regenerating them. Only a successful push build on the named candidate
branch may record generated files, never merge or deploy them.

The editing environment blocks localhost browser navigation. Browser acceptance
therefore runs in GitHub Actions; viewport tests do not constitute phone-device
or screen-reader certification. Publication consistency does not rerun the
producing Python engine or establish predictive performance.

Implementation references: MDN Clipboard.writeText documents secure-context and
permission failure handling; W3C Understanding SC 1.4.10 distinguishes reflowing
prose from genuinely two-dimensional data tables.
