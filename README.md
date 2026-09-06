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
- `assets/market-visual.mjs`: the hero visual, a ring of daily candlesticks rendered with three.js (WebGL). `assets/market-model.mjs` holds the pure geometry, timing and easing rules it uses, and `assets/market-data.mjs` the embedded price series. The static fallback is `assets/market-ring.png`.
- `tests/market-model.test.mjs`: unit tests for the scene model, run with `node --test`.
- `assets/Yiping-Yin-CV.pdf`: downloadable CV; replace the PDF without changing its URL.
- `assets/share-card.html`: source for the 1200 × 630 social card. Capture this page at that viewport size to regenerate `assets/og-image.png`, then update the image version in the share metadata.

Content was aligned with the supplied AI/Quant CV in September 2026. Beixi internship details were supplied separately: AI Quantitative Engineer intern, August 2026–present, Wudaokou, Beijing; RAG research and system development. The supplied PDF is unchanged.

Keep research context attached to numerical results: competition category, historical diagnostic partition, proxy assumptions, or the specific simulation. Preserve the distinction between implemented systems and proposed experiments.

## Check changes

```sh
node --check assets/site.js
node --check assets/market-visual.mjs
node --test
git diff --check
```

Preview at phone, tablet and desktop widths. Check the CV and report links, keyboard navigation (including arrow, Home and End keys on the research tabs), fragment links, expandable details, theme persistence, disabled JavaScript/storage, and print colors. For the hero, check the arrival, one beat per 1.2 s stepping the drum exactly one tick, the stop at the end of the record, hovering, dragging, the arrow/Home/End/space keys on the canvas, that the caption matches the session under the pen, and that `prefers-reduced-motion` shows the last window at rest. Printing includes every research category. `output/` and browser artifacts are excluded from Git.

## Visual assets

The hero visual is a drum of daily candlesticks read by a fixed pen. Candle bodies and wicks sit on an inner ring, volume bars on an outer ring, white blades run from the axis to the volume bar of the first session of each ISO week, and the same weeks carry date labels standing in vertical radial planes (a label is drawn only while its plane faces the camera, so nothing reads mirrored). Around them a dial stands still in the world: a rim at the volume ring, one tick per slot, and two lines marking the three-slot gap. The camera dollies in without ever leaving the composition the still was designed as, and then the drum steps one session clockwise per beat — the oldest session dissolving into the gap while the newest is printed under the pen and the nib slides to its close. It stops at the end of the record rather than looping. Hovering a session widens it and swaps the caption's second line; dragging rocks the drum and settles on a tick; the canvas is a slider, so the arrow, Home and End keys step through the sessions and the space bar stops and starts the beat. The composition follows the hero of imc.com; the implementation is this repository's own.

The price series is the S&P 500 index (^GSPC) daily open, high, low, close and volume for 110 NYSE sessions ending 2026-09-04, captured from Yahoo Finance and embedded in `assets/market-data.mjs` alongside its `meta` record. It is illustrative only. To swap it, replace that file with any array of `{ label, open, high, low, close, volume }` rows with an even length and update `meta`. Every figure in the caption — the date range, the session count, the capture date and the ×8.7 vertical exaggeration — is derived from that file and the model's `GLYPH_RATIO` by `captionLines()`, and a test asserts that the copy in `index.html` equals the same function's output for the last session, so the caption cannot drift from the data. The scene honours `prefers-reduced-motion` (the drum at the end of the record, fully printed, with no beat), remembers where it had got to in `sessionStorage` so a second visit fades up instead of performing, renders nothing at all between beats, and stops rendering and cancels its wake-up timer while the canvas is offscreen or the page is hidden. Phones get a shorter one-line caption, no date labels and no ticks.

Section icons are [Heroicons](https://github.com/tailwindlabs/heroicons), distributed under the MIT license included at `assets/icons/LICENSE.txt`. The Susquehanna competition mark is documented in `assets/algothon-marks.provenance.txt` and identifies the Algothon host.

GitHub Pages publishes the default branch. A feature branch or pull request does not update the live site until it is merged.
