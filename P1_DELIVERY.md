# P1 delivery record

Scope: UPGRADE_PLAN.md P1-01, P1-02 and P1-03 only.

## Implemented

- Home and Lab place the same public Algothon report/code links at the archive entry.
- Ten Profile projects have stable project-* fragments; the old section fragments remain.
- Profile P.Book and Lab link to the retained AAPL trend report, matching replay, the full published-run table and the historical desk. No historical description points to the synthetic desk.
- The public IDE downloads the current textarea value as a UTF-8 Python file, including an edited or empty draft. It does not replace text with published source or update financial records.
- Download errors are announced without changing editor text. Controls support keyboard activation and 44px mobile targets.

## Verification

[Acceptance run 35545407568](https://github.com/Yiping-Yin/Yiping-Yin.github.io/actions/runs/35545407568) passed 12 static Python acceptance checks, 6 Node source-export tests and 11 real Chromium browser scenarios. Browser coverage includes all four sources, edited UTF-8 and empty drafts, reload persistence, download failure, keyboard activation, route changes, ten project fragments, report/back/forward navigation and three viewport sizes: 1440x900, 1440x600 and 390x844. No JavaScript page errors or non-GET application requests were recorded by those scenarios. The run retains screenshots and test logs as artifacts.

The first run exposed four browser-harness setup errors; correcting the nonexistent desktop Edit-button assumption, same-document navigation response handling and failure-stub evaluation kept every behavioral assertion intact. Product code was not changed to hide those errors.

Generated pages were committed by the successful acceptance job as c1d52155d89c292a59d3299938aa5f6e819e051e. This is a candidate record, not proof of production deployment. After merge, Pages must succeed; Verify published website independently requests the public application files and compares SHA-256 hashes against that exact deployed commit.

## Integration boundary

The original public trading bundles, engine policy, price tapes, all 15 published runs and private-note boundaries are unchanged. The accessible PBook/main is older than this public export, so these changes are maintained as a reproducible public post-export enhancement. PUBLIC_P1.md explains how to preserve and reapply it; release.json labels its provenance separately. The local Python runtime was not modified or retested in this batch. P2 remains pending.
