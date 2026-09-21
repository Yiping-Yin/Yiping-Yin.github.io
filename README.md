# Yiping Yin — personal website

Static site for [yiping-yin.github.io](https://yiping-yin.github.io/), served by GitHub Pages from `main`.

This checkpoint includes a compact homepage terminal, competition results, published P.Book runs and the Lab project/method library; the complete Profile; the Lab's public research structure; and P.Book's Overview, Trading, report/replay and Strategies surfaces. Strategies defaults to source reading, with optional browser-local edits. Python strategy execution requires the local P.Book runtime.

## Upgrade plan

See [个人网页升级安排 / Upgrade plan](UPGRADE_PLAN.md) for completed P1/P2 releases, remaining research work and acceptance criteria. Update the checklist and release references as each batch ships.

## Routes

- `/` — terminal replay, competition results, published Training runs and Lab library/maps.
- `/profile.html` — selected work, experience, awards, toolkit and contact.
- `/lab.html` — five research domains, six workflow stages, method notes and case archives. Original notes and attachments remain private.
- `/training.html#/training` — P.Book Overview.
- `/training.html#/market` — manual Trading on 26 deterministic synthetic teaching instruments, using `SIM` units.
- `/training.html?market=historical#/market` — Trading on retained ^GSPC, AAPL, MSFT and NVDA price tapes.
- `/training.html?market=historical#/market?view=review&run=<runId>` — a published run's report; use `view=replay` for its replay. Synthetic runs use `market=synthetic`.
- `/training.html#/studio` — strategy source gallery with four published source files and their SHA-256 digests, editable browser-local drafts and the 15-run archive.
- `/compare.html?a=<runId>&b=<runId>` — matched-condition comparison of two published runs.
- `/research-algothon.html` — a source-pinned public research case.
- `/404.html` — self-contained recovery page.

`/semicircle-compositions.html` and `/cycle-study.html` are retired-address redirects to the homepage. The latter is a `noindex` stub, not an active study page. `robots.txt` and `sitemap.xml` list the public canonical pages.

The homepage and historical desk use retained Yahoo Finance one-minute OHLC from 10 September 2026, with 390 bars per tape. ^GSPC is an index; AAPL, MSFT and NVDA are NASDAQ-listed equities. The default synthetic scenario is generated for teaching and is not market data. In both modes the order book, account, orders, fills and P&L are simulated. There is no broker connection or live order placement. Browser accounts stay local to each origin.

Fifteen strategy runs produced by the local runtime are published as static records: twelve historical and three synthetic. `release.json` records tape checksums, published-run sources, the portfolio snapshot and the terminal payload. The exporter includes only verified public assets and data; it does not read the private research vault.

Source checkpoint: `3df5164f14f245ed63f45f5e9ff4dfa72714c624` in the private P.Book repository. Build with `npm run build:public`. The exported snapshot is enhanced by the reproducible public P1/P2 scripts. Preserve all public enhancement modules, scripts, tests, workflows and documentation when refreshing exported assets; follow `PUBLIC_P1.md` and `PUBLIC_P2.md`. Preparing a local commit does not deploy it; deployment follows a push to GitHub Pages.

For a local preview, run `python3 -m http.server 4173 --bind 127.0.0.1` and open [localhost:4173](http://127.0.0.1:4173/). No backend is needed for manual paper trading.

Section icons are Heroicons under the MIT license retained at `portfolio-assets/icons/LICENSE.txt`.

## Release verification

P1 and P2 were production-verified at `e772992`; their delivery records link the evidence. `RELEASE_MAINTENANCE.md` documents the replacement post-push verifier, manual recovery, failure handling and narrow-screen chart maintenance. New maintenance changes remain candidates until their own PR is merged and the new production verification succeeds.
