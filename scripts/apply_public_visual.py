"""Reversible, static homepage presentation; run after all public generators.

Does not regenerate charts, market payloads, strategy results or app bundles.
Fail closed when the known homepage structure changes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
STYLE = 'portfolio-assets/home-visual.css'
VERIFIER = 'scripts/verify_public_release.py'
MARK = '<!-- public-visual:v1 -->'
OLD_HEADING = '<h1 class="sr-only">Yiping Yin — quantitative research and trading</h1>'
INTRO = '''<!-- public-visual:intro:start -->
    <section class="home-intro" aria-labelledby="home-identity">
      <div class="home-intro-inner">
        <div class="home-intro-copy">
          <p class="home-eyebrow">Research · Code · Markets</p>
          <h1 id="home-identity">Yiping Yin<span class="home-role">Quantitative research &amp; trading</span></h1>
        </div>
        <nav class="home-actions" aria-label="Explore my work">
          <a class="home-primary" href="/training.html?market=historical#/training">Explore P.Book <span aria-hidden="true">→</span></a>
          <a class="home-secondary" href="/profile.html">View Profile <span aria-hidden="true">↗</span></a>
        </nav>
      </div>
    </section>
    <!-- public-visual:intro:end -->'''
OLD_BODY = '<body class="semicircle-study">'
NEW_BODY = '<body class="semicircle-study blue-white-home">'
GROUPS = "['publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes', 'publicPolish', 'publicDemo']"


def once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise ValueError('Visual source structure changed: ' + old[:100])
    return text.replace(old, new, 1)


def restore_home(text: str) -> str:
    if MARK not in text:
        return text
    text = once(text, INTRO, OLD_HEADING)
    text = once(text, NEW_BODY, OLD_BODY)
    styles = re.findall(re.escape(MARK) + r'\n<link rel="stylesheet" href="/portfolio-assets/home-visual\.css\?v=[0-9a-f]{12}">\n', text)
    if len(styles) != 1:
        raise ValueError('Visual stylesheet marker is missing or duplicated')
    return once(text, styles[0], '')


def transform_home(text: str, css_version: str) -> str:
    if not re.fullmatch(r'[0-9a-f]{12}', css_version):
        raise ValueError('Invalid stylesheet version')
    text = restore_home(text)
    text = once(text, OLD_BODY, NEW_BODY)
    text = once(text, OLD_HEADING, INTRO)
    return once(text, '</head>', MARK + '\n<link rel="stylesheet" href="/' + STYLE + '?v=' + css_version + '">\n</head>')


def transform_verifier(text: str) -> str:
    old = 'for group in ' + GROUPS + ':'
    new = 'for group in ' + GROUPS + " + ['publicVisual']:"
    if old not in text and text.count(new) == 1:
        return text
    return once(text, old, new)


def apply(root: Path = ROOT, check: bool = False) -> list[str]:
    root = Path(root)
    css_digest = hashlib.sha256((root / STYLE).read_bytes()).hexdigest()
    home = (root / 'index.html').read_text(encoding='utf-8')
    updates = {
        'index.html': transform_home(home, css_digest[:12]),
        VERIFIER: transform_verifier((root / VERIFIER).read_text(encoding='utf-8')),
    }
    if restore_home(updates['index.html']) != restore_home(home):
        raise ValueError('Existing homepage evidence changed')
    digests = {name: hashlib.sha256(text.encode('utf-8')).hexdigest() for name, text in updates.items()}
    release = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    for group in release.values():
        if isinstance(group, dict) and isinstance(group.get('files'), dict):
            for name in group['files']:
                if name in digests:
                    group['files'][name] = digests[name]
    release['publicVisual'] = {
        'version': 'blue-white-home-v1',
        # Existing groups already own shared HTML/verifier hashes and refresh
        # them when catalogue content changes. Do not duplicate that ownership.
        'files': {STYLE: css_digest},
        'note': 'Homepage presentation only. Original terminal, app bundles, source code, tapes, results and routes are retained.',
    }
    updates['release.json'] = json.dumps(release, indent=2, ensure_ascii=False) + '\n'
    changed = [name for name, text in updates.items() if (root / name).read_text(encoding='utf-8') != text]
    if check and changed:
        raise SystemExit('Visual regeneration required: ' + ', '.join(changed))
    if not check:
        for name in changed:
            (root / name).write_text(updates[name], encoding='utf-8')
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    print('Visual presentation:', ', '.join(apply(check=args.check)) or 'already current')
