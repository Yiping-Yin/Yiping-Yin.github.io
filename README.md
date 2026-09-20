# Yiping Yin — personal website

Static site for [yiping-yin.github.io](https://yiping-yin.github.io/), served by GitHub Pages from `main`.

This checkpoint includes a compact homepage terminal, competition results, published P.Book runs and the Lab project/method library; the complete Profile; the Lab's public research structure; and P.Book's Overview, Trading, report/replay and IDE surfaces. The public IDE supports browser-local strategy edits. Python strategy execution requires the local P.Book runtime.

## Routes

- `/` — terminal replay, competition results, published Training runs and Lab library/maps.
- `/profile.html` — selected work, experience, awards, toolkit and contact.
- `/lab.html` — five research domains, six workflow stages, method notes and case archives. Original notes and attachments remain private.
- `/training.html#/training` — P.Book Overview.
- `/training.html#/market` — manual Trading on 26 deterministic synthetic teaching instruments, using `SIM` units.
- `/training.html?market=historical#/market` — Trading on retained ^GSPC, AAPL, MSFT and NVDA price tapes.
- `/training.html?market=historical#/market?view=review&run=<runId>` — a published run's report; use `view=replay` for its replay. Synthetic runs use `market=synthetic`.
- `/training.html#/studio` — strategy IDE with four published source files and their SHA-256 digests, editable browser-local drafts and the 15-run archive.
- `/404.html` — self-contained recovery page.

`/semicircle-compositions.html` and `/cycle-study.html` are retired-address redirects to the homepage. The latter is a `noindex` stub, not an active study page. `robots.txt` and `sitemap.xml` list the public canonical pages.

The homepage and historical desk use retained Yahoo Finance one-minute OHLC from 10 September 2026, with 390 bars per tape. ^GSPC is an index; AAPL, MSFT and NVDA are NASDAQ-listed equities. The default synthetic scenario is generated for teaching and is not market data. In both modes the order book, account, orders, fills and P&L are simulated. There is no broker connection or live order placement. Browser accounts stay local to each origin.

Fifteen strategy runs produced by the local runtime are published as static records: twelve historical and three synthetic. `release.json` records tape checksums, published-run sources, the portfolio snapshot and the terminal payload. The exporter includes only verified public assets and data; it does not read the private research vault.

Source checkpoint: `08c3ae260e5ff505a6d55290c9d2e87262f6a2f8` in the private P.Book repository. Build with `npm run build:public`. The final artifact is copied byte-for-byte into this mirror apart from repository metadata and this README. Preparing a local commit does not deploy it; deployment follows a push to GitHub Pages.

For a local preview, run `python3 -m http.server 4173 --bind 127.0.0.1` and open [localhost:4173](http://127.0.0.1:4173/). No backend is needed for manual paper trading.

Section icons are Heroicons under the MIT license retained at `portfolio-assets/icons/LICENSE.txt`.
