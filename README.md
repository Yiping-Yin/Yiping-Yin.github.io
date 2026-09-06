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
- `assets/site.js`: optional theme control, mobile navigation, accessible research tabs and section tracking. Without JavaScript, all research sections remain visible. Fragment links select the relevant research tab and reveal their target.
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

Preview at phone, tablet and desktop widths. Check the CV and report links, keyboard navigation (including arrow, Home and End keys on the research tabs), fragment links, expandable details, theme persistence, disabled JavaScript/storage, and print colors. For the hero, check the fly-in, the slow rotation, dragging with a mouse, and that `prefers-reduced-motion` shows a still ring. Printing includes every research category. `output/` and browser artifacts are excluded from Git.

## Visual assets

The hero visual is a ring of daily candlesticks: candle bodies and wicks on an inner ring, volume bars on an outer ring, white blades from the axis to every third volume bar, and date labels standing in vertical radial planes (so labels on the far side read mirrored). The camera flies in along a cubic Bézier curve, the ring then turns slowly and can be dragged with a mouse, and every 200 ms the visible window advances one day, so bars fade out on one side while new ones grow in on the other. The composition follows the hero of imc.com; the implementation is this repository's own.

The price series is the S&P 500 index (^GSPC) daily open, high, low, close and volume for 110 NYSE sessions ending 2026-09-04, captured from Yahoo Finance and embedded in `assets/market-data.mjs`. It is illustrative only. To swap it, replace that file with any array of `{ label, open, high, low, close, volume }` rows with an even length. The scene honours `prefers-reduced-motion` (a still ring at the resting camera), stops rendering while the canvas is offscreen or the page is hidden, and never renders on touch-only drags.

Section icons are [Heroicons](https://github.com/tailwindlabs/heroicons), distributed under the MIT license included at `assets/icons/LICENSE.txt`. The Susquehanna competition mark is documented in `assets/algothon-marks.provenance.txt` and identifies the Algothon host.

GitHub Pages publishes the default branch. A feature branch or pull request does not update the live site until it is merged.
