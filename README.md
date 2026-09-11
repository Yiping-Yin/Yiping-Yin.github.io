# Yiping Yin — personal website

A responsive portfolio served by GitHub Pages. The pages are hand-written; the only runtime dependency is three.js, loaded from jsDelivr for the hero visual.

## Preview locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. No install or build step is required.

## Update content

- `index.html`: biography, projects, experience, education and share metadata.
- `assets/site.css`: responsive layout, light/dark themes and print styles.
- `assets/site.js`: optional theme control (light is the default; the toggle cycles light, dark, then system), mobile navigation, accessible research tabs and section tracking. Without JavaScript, all research sections remain visible. Fragment links select the relevant research tab and reveal their target.
- `assets/market-arcs.mjs`: the hero visual, three arcs of S&P 500 candlesticks rendered with three.js (WebGL). `assets/market-arcs-model.mjs` holds the pure geometry, timing and caption rules it uses, and `assets/market-arcs-data.mjs` the three embedded price windows. The static fallback is `assets/market-arcs.png`.
- `tests/market-arcs-model.test.mjs`: unit tests for the scene model, run with `node --test tests/*.test.mjs`.
- `assets/Yiping-Yin-CV.pdf`: downloadable CV; replace the PDF without changing its URL.
- `assets/share-card.html`: source for the 1200 × 630 social card. Capture this page at that viewport size to regenerate `assets/og-image.png`, then update the image version in the share metadata.

Content was aligned with the supplied AI/Quant CV in September 2026. Beixi internship details were supplied separately: AI Quantitative Engineer intern, August 2026–present, Wudaokou, Beijing; RAG research and system development. The supplied PDF is unchanged.

Keep research context attached to numerical results: competition category, historical diagnostic partition, proxy assumptions, or the specific simulation. Preserve the distinction between implemented systems and proposed experiments.

## Check changes

```sh
node --check assets/site.js
node --check assets/market-arcs.mjs
node --test
git diff --check
```

Preview at phone, tablet and desktop widths. Check the CV and report links, keyboard navigation (including arrow, Home and End keys on the research tabs), fragment links, expandable details, theme persistence, disabled JavaScript/storage, and print colors. For the hero, check that the three arcs rise from the bottom edge with the pen at the top, that the day arc replays the session one 5-minute bar per 0.6 s beat and then rests before replaying, that hovering an arc reads its bar into the screen-reader caption, and that `prefers-reduced-motion` shows the close at rest. Printing includes every research category. `output/` and browser artifacts are excluded from Git.

## Visual assets

The hero visual is three concentric arcs of one instant, rising from the bottom edge of the box: a year of daily candles outside, a month of hourly candles, and a day of 5-minute candles inside. Angle is time within each arc's period — the year arc is calendar time, so weekends and holidays leave gaps and a week reads as five marks; the month and day arcs are trading time, with a gap at each session and each hour — and every arc has its own low price axis, so height is price within its window. Candles are thin and flat, planted on their arc's hairline: the wick rises from the floor to the bar's high and the body sits at its open and close, both drawn taller than the band they stand in, as imc.com exaggerates its glyphs. Colour is direction; the bars sink toward the ground as they age, so the newest stretch beside the pen is the vividest and the oldest dissolves before the seam. One pen at the top reads the same moment on all three arcs, with the last price at its head and each arc's bar span beside it; month names carry their year. The disc's centre sits on the box's bottom edge and the camera is a long lens at 50°, so the arcs read as a half-dial on the page rather than a floating ring. The data turns under the pen: the day arc replays the captured session one bar per 0.6 s beat, printing each bar as it arrives, while the month arc creeps one hourly bar every twelve beats; at the close the picture rests, then the day dissolves and replays. Hovering an arc reads that bar into the caption, which is written for screen readers only. The composition follows the hero of imc.com and the anchoring of IO RIVER's; the instrument is this repository's own.

The price series is the S&P 500 index (^GSPC): a year of daily bars ending 2026-09-10, a month of hourly bars and the session of 2026-09-10 in 5-minute bars, captured from Yahoo Finance's chart API on 2026-09-11 and embedded in `assets/market-arcs-data.mjs` alongside its `meta` record. It is illustrative only. Every figure in the screen-reader caption — the session date, the capture date, the bar span and its open, high, low and close — is derived from that file by `captionLines()`, and a test asserts that the copy in `index.html` equals the same function's output for the last bar, so the caption cannot drift from the data. The scene honours `prefers-reduced-motion` (the close at rest, no replay), stops rendering while the canvas is offscreen or the page is hidden, halves its pixel ratio if frames run slow, and on a phone frames the pen and the top of the arcs by height, cropping the sides.

Section icons are [Heroicons](https://github.com/tailwindlabs/heroicons), distributed under the MIT license included at `assets/icons/LICENSE.txt`. The Susquehanna competition mark is documented in `assets/algothon-marks.provenance.txt` and identifies the Algothon host.

GitHub Pages publishes the default branch. A feature branch or pull request does not update the live site until it is merged.
