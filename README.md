# Yiping Yin — personal website

A responsive, dependency-free portfolio served by GitHub Pages.

## Preview locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. No install or build step is required.

## Update content

- `index.html`: biography, projects, experience, education and share metadata.
- `assets/site.css`: responsive layout, light/dark themes and print styles.
- `assets/site.js`: optional theme control, mobile navigation, accessible research tabs and section tracking. Without JavaScript, all research sections remain visible. Fragment links select the relevant research tab and reveal their target.
- `assets/market-visual.js`: original interactive study of time and measurement, rendered with Canvas 2D; its static fallback is `assets/market-clock.png`.
- `assets/Yiping-Yin-CV.pdf`: downloadable CV; replace the PDF without changing its URL.
- `assets/share-card.html`: source for the 1200 × 630 social card. Capture this page at that viewport size to regenerate `assets/og-image.png`, then update the image version in the share metadata.

Content was aligned with the supplied AI/Quant CV in September 2026. Beixi internship details were supplied separately: AI Quantitative Engineer intern, August 2026–present, Wudaokou, Beijing; RAG research and system development. The supplied PDF is unchanged.

Keep research context attached to numerical results: competition category, historical diagnostic partition, proxy assumptions, or the specific simulation. Preserve the distinction between implemented systems and proposed experiments.

## Check changes

```sh
node --check assets/site.js
node --check assets/market-visual.js
git diff --check
```

Preview at phone, tablet and desktop widths. Check the CV and report links, keyboard navigation (including arrow, Home and End keys on the research tabs), fragment links, expandable details, theme persistence, disabled JavaScript/storage, and print colors. Printing includes every research category. `output/` and browser artifacts are excluded from Git.

## Visual assets

The visualization is an original code-drawn arrangement of open, staggered measurement planes. Calibrated edges, sparse signal traces and elevated candle marks share the same projected coordinates. The structure gently changes viewpoint while signals evolve and an observation travels through the sequence. A broad blue light field and fine alignment rules support the composition.

Signals and candle marks are illustrative, not actual prices. The small Beijing and Sydney time readouts use `Intl.DateTimeFormat` with `Asia/Shanghai` and `Australia/Sydney`, including daylight-saving changes. City controls select the accent on the leading section; hovering a section highlights its edges. Reduced-motion preferences and Pause freeze the animated geometry while the local times continue updating each minute. Motion stops while the canvas is offscreen or the page is hidden. Reference study notes and previous iterations remain in ignored `output/`; no reference model, animation or image is shipped as a website asset.

Section icons are [Heroicons](https://github.com/tailwindlabs/heroicons), distributed under the MIT license included at `assets/icons/LICENSE.txt`. The Susquehanna competition mark is documented in `assets/algothon-marks.provenance.txt` and identifies the Algothon host.

GitHub Pages publishes the default branch. A feature branch or pull request does not update the live site until it is merged.
