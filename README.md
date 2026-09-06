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
- `assets/site.js`: optional theme control, mobile navigation and section tracking.
- `assets/Yiping-Yin-CV.pdf`: downloadable CV; replace the PDF without changing its URL.
- `assets/share-card.html`: source for the 1200 × 630 social card. Capture this page at that viewport size to regenerate `assets/og-image.png`, then update the image version in the share metadata.

Content was aligned with the supplied AI/Quant CV in September 2026. Beixi internship details were supplied separately: AI Quantitative Engineer intern, August 2026–present, Wudaokou, Beijing; RAG research and system development. The supplied PDF is unchanged.

Keep research context attached to numerical results: competition category, historical diagnostic partition, proxy assumptions, or the specific simulation. Preserve the distinction between implemented systems and proposed experiments.

## Check changes

```sh
node --check assets/site.js
git diff --check
```

Preview at phone, tablet and desktop widths. Check the CV and report links, keyboard navigation, expandable details, theme persistence, disabled JavaScript/storage, and print colors. `output/` and browser artifacts are excluded from Git.

GitHub Pages publishes the default branch. A feature branch or pull request does not update the live site until it is merged.
