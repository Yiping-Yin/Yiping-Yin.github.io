# P2 delivery — released and production-verified

Scope: UPGRADE_PLAN.md P2-01, P2-02 and P2-03, on top of merged P1 commit `e56b1d175045a0d2bd6551fbc48056b1456f9651`.

## Implemented

- `research-algothon.html`: an English research case with a common-scale evidence figure, explicitly separate General-round and Final-round outcomes, limitations and source links pinned to the public Algothon repository. Home, Profile and Lab reach the case without JavaScript.
- `compare.html`: choose two completed published runs; inspect all 390 equity observations and the common benchmark; compare recorded P&L, returns, drawdown, fees, fills, traded quantities and ending positions. Selection is URL-backed. Report, replay and source links preserve run/task/market context.
- Home: the terminal's currently selected instrument controls its evidence links and matching entries in the existing 15-run table. No terminal matching or playback logic was changed.

## Verified acceptance

[Public P2 acceptance run 35548697008](https://github.com/Yiping-Yin/Yiping-Yin.github.io/actions/runs/35548697008) passed. Its generated pages were recorded by commit `dee602c93343217621efe1eea14c1a0f8b16776c`.

| Checks | Passed |
| --- | ---: |
| P1 page/link regression | 12 |
| P2 artifact and evidence contracts | 10 |
| Existing source-export unit tests | 6 |
| P2 comparison model tests | 34 |
| P1 real Chromium regression scenarios | 11 |
| P2 real Chromium user journeys | 12 |
| Total distinct checks | 85 |

Browser coverage includes 1440×900, 1440×600, 390×844 and 320×740 viewports; dark and reduced-motion settings; keyboard minute inspection; share-link reload and browser history; invalid and cross-market selections; source/replay navigation; digest mismatch and request failure recovery; Home instrument switching; and no-JavaScript case/fallback content. Screenshots and logs are retained in the run's `p2-acceptance-evidence` artifact. The downloaded evidence archive SHA-256 was verified as `76126d442ff9bb1556f7b7eaa8bf53994d77c8c2397f20a02c38df04f1216803`.

All seven generated files were checked byte-for-byte against the successful CI artifact. P1 and P2 generators both pass their idempotency checks. The branch diff and desktop/mobile screenshots were reviewed inline; no separate reviewer or full accessibility audit is claimed.

## Boundaries

Original trading bundles, historical/synthetic tapes, submitted strategy sources and all 15 published runs remain unchanged. The new comparison verifies public file/source digests and rejects missing or mismatched compatibility evidence. It neither executes Python nor changes browser trading accounts or IDE drafts. The private P.Book engine suite was not rerun for this public-only change.

The curated case summarizes existing public team records; it does not rerun the Algothon evaluation or assert that competition scores are investment returns. Research details remain traceable to the pinned sources.

## Release status

Released by [PR #3](https://github.com/Yiping-Yin/Yiping-Yin.github.io/pull/3), merge commit `e772992872b3563b4c57e759427e14b7735a53fe`. [Pages deployment #28](https://github.com/Yiping-Yin/Yiping-Yin.github.io/actions/runs/35549536362) succeeded on 21 September 2026.

[Production audit 35549971632](https://github.com/Yiping-Yin/Yiping-Yin.github.io/actions/runs/35549971632) verified all 52 public application files using both ordinary and version-query URLs (104 responses), with HTTP 200 and matching SHA-256. The 85 checks include 23 browser scenarios against the official HTTPS site, not only a local preview. The audit evidence archive digest is `51bbce85fb1e451bed6b0007da9d148a8cd81ba731613b476148c4d2f559e0ae`.

These results identify release `e772992`; later maintenance changes require their own candidate and post-deployment checks. Chromium viewport tests do not constitute a physical iPhone/Safari or full screen-reader audit. See `PUBLIC_P2.md` and `RELEASE_MAINTENANCE.md` for maintenance instructions.
