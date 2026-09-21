"""Reproduce the four approved audit fixes after P1, P2 and presentation copy.

Public pages only: no engine, strategy, result, tape or generated UI-module edits.
The case catalogue is rendered at build time, so links/counts also work without JS.
All edits are prepared before writing; unexpected source shapes fail closed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = '7acdc4732ce09294bc21f27c9b688484ef2fc7f5'
MARK = '<!-- public-four-fixes:v1 -->'
CSS = '<link rel="stylesheet" href="/portfolio-assets/four-fixes.css?v=1">'
PAGES = ['index.html', 'profile.html', 'lab.html', 'training.html']


def once(text, old, new):
    if old == new:
        return text
    if text.count(new) == 1 and old not in text:
        return text
    if text.count(old) != 1:
        raise ValueError('Four-fix source structure changed: ' + old[:95])
    return text.replace(old, new, 1)


def subonce(pattern, replacement, text):
    text, count = re.subn(pattern, lambda m: replacement(m) if callable(replacement) else replacement, text, flags=re.S)
    if count != 1:
        raise ValueError('Expected one four-fix source region: ' + pattern[:95])
    return text


def catalogue(root):
    cases = json.loads((root / 'scripts/public_case_catalogue.json').read_text(encoding='utf-8'))
    ids = [c['id'] for c in cases]
    if not cases or len(ids) != len(set(ids)) or any(not re.fullmatch(r'[a-z0-9-]+', x) for x in ids):
        raise ValueError('Case catalogue needs unique stable identifiers')
    for c in cases:
        if not c.get('title') or not c.get('subject'):
            raise ValueError('Case title or subject is missing')
        if any(k in c for k in ['case', 'report', 'code']):
            if c['id'] != 'algothon' or [c.get(k) for k in ['case', 'report', 'code']] != [
                '/research-algothon.html',
                'https://github.com/Yiping-Yin/algothon-2026/blob/main/Algothon-Research-Report.pdf',
                'https://github.com/Yiping-Yin/algothon-2026',
            ]:
                raise ValueError('Unreviewed public case destination')
    if ids.count('algothon') != 1 or not next(c for c in cases if c['id'] == 'algothon').get('case'):
        raise ValueError('The public Algothon case is required')
    return cases


def link(url, label, cls=''):
    attr = f' class="{cls}"' if cls else ''
    return f'<a{attr} href="{escape(url, quote=True)}">{escape(label)}</a>'


def evidence(c):
    return '<span class="p1-evidence-links">' + link(c['report'], 'Research report · PDF') + link(c['code'], 'Code and materials') + '</span>'


def case_link(c):
    return link(c['case'], 'Read the research case →', 'p2-case-entry')


def home_cases(cases):
    items = []
    for c in cases:
        extra = ' id="lab-archive-algothon" class="p1-public-archive"' if 'case' in c else ''
        body = escape(c['title']) + ' <small>' + escape(c['subject']) + '</small>'
        if 'case' in c:
            body += evidence(c) + case_link(c)
        items.append(f'<li{extra} data-case-id="{c["id"]}">{body}</li>')
    return f'<div><h3>Case archives <span>{len(cases)}</span></h3><ul>' + ''.join(items) + '</ul></div>'


def lab_cases(cases):
    rows = []
    for i, c in enumerate(cases, 1):
        ident = ' id="archive-algothon"' if 'case' in c else ''
        body = escape(c['subject']) + (evidence(c) if 'case' in c else '')
        rows.append(f'<tr{ident} data-case-id="{c["id"]}"><td class="idx">{i:02d}</td><th scope="row">{escape(c["title"])}</th><td class="soft">{body}</td></tr>')
        if 'case' in c:
            rows.append('<tr class="p2-case-entry"><td colspan="3">' + case_link(c) + '</td></tr>')
    return '<tbody>' + ''.join(rows) + '</tbody>'


def transform(name, text, cases):
    if '<!-- public-copy:v1 -->' not in text:
        raise ValueError('Apply the reviewed presentation-copy generator first')
    if name == 'index.html':
        text = subonce(r'<div><h3>Case archives <span>\d+</span></h3><ul>.*?</ul></div>', home_cases(cases), text)
        text = subonce(r'(<div><dt>Library</dt><dd>Theory · \d+ methods · )\d+( cases</dd></div>)', lambda m: m[1] + str(len(cases)) + m[2], text)
        c = next(c for c in cases if c['id'] == 'algothon')
        card = '<!-- four-fixes:mobile-case:start -->\n<article class="lab-phone-featured" id="home-featured-case" aria-labelledby="home-featured-case-title"><h3 id="home-featured-case-title">' + escape(c['title']) + '</h3>' + case_link(c) + evidence(c) + '</article>\n<!-- four-fixes:mobile-case:end -->'
        if '<!-- four-fixes:mobile-case:start -->' in text:
            text = subonce(r'<!-- four-fixes:mobile-case:start -->.*?<!-- four-fixes:mobile-case:end -->', card, text)
        else:
            needle = '<a class="lab-phone-open"'
            text = once(text, needle, card + '\n        ' + needle)
        text = once(text, '<p class="lab-phone-say">The notes are not published.</p>', '<p class="lab-phone-say">Other research notes remain private.</p>')
    elif name == 'lab.html':
        text = subonce(r'(<dt>Archives</dt><dd>)\d+(</dd>)', lambda m: m[1] + str(len(cases)) + m[2], text)
        text = subonce(r'(<h3>Case archives</h3>.*?<table\b.*?</thead>\s*)<tbody>.*?</tbody>', lambda m: m[1] + lab_cases(cases), text)
    elif name == 'profile.html':
        old = '<p class="figure"><span class="figure-label">Evaluation</span><span class="figure-value">3.7 points · 0.4 standard errors</span><span class="figure-basis">behind second place · from the public-data replay mean</span></p>'
        new = '<div class="figure evaluation-comparisons"><span class="figure-label">Evaluation</span><p><span class="figure-value">3.7 points</span> behind second place.</p><p>About <span class="figure-value">0.4 of one block’s standard error</span> from the public-data replay mean.</p></div>'
        text = once(text, old, new)
    elif name != 'training.html':
        raise ValueError('Unreviewed page: ' + name)
    if MARK not in text:
        text = once(text, '</head>', MARK + '\n' + CSS + '\n</head>')
    elif text.count(CSS) != 1:
        raise ValueError('The four-fix stylesheet must be included exactly once')
    return text


def apply(root=ROOT, check=False):
    root = Path(root)
    cases = catalogue(root)
    immutable = json.loads((root / 'scripts/presentation_copy.json').read_text())['immutableInputs']
    for name, sha in immutable.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != sha:
            raise ValueError('Immutable public input changed: ' + name)
    updates = {name: transform(name, (root / name).read_text(encoding='utf-8'), cases) for name in PAGES}
    # Extend the existing release verifier's manifest allowlist, without changing
    # any deployment, checksum-comparison, API or credential behavior.
    verifier = 'scripts/verify_public_release.py'
    updates[verifier] = once((root / verifier).read_text(), "['publicEnhancements', 'publicP2', 'publicCopy']", "['publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes']")
    release = json.loads((root / 'release.json').read_text())
    hashes = {n: hashlib.sha256(updates[n].encode()).hexdigest() for n in PAGES}
    css = 'portfolio-assets/four-fixes.css'
    hashes[css] = hashlib.sha256((root / css).read_bytes()).hexdigest()
    for group in ['publicEnhancements', 'publicP2', 'publicCopy']:
        for name in release[group]['files']:
            if name in hashes:
                release[group]['files'][name] = hashes[name]
    release['publicFourFixes'] = {
        'version': 'four-fixes-20260921-v1', 'baseCommit': BASE,
        'scope': ['Mobile research entry', 'Mobile desk navigation', 'Shared case catalogue', 'Explicit statistical comparators'],
        'files': hashes,
        'catalogueSHA256': hashlib.sha256((root / 'scripts/public_case_catalogue.json').read_bytes()).hexdigest(),
        'note': 'Presentation only. Original runtime assets, generated UI modules, strategy sources, tapes and published results are unchanged.',
    }
    updates['release.json'] = json.dumps(release, indent=2, ensure_ascii=False) + '\n'
    changed = [n for n, text in updates.items() if not (root / n).exists() or (root / n).read_text(encoding='utf-8') != text]
    if check:
        if changed:
            raise SystemExit('Four audit fixes need regeneration: ' + ', '.join(changed))
    else:
        for name in changed:
            (root / name).write_text(updates[name], encoding='utf-8', newline='')
    print('Four audit fixes: ' + (', '.join(changed) if changed else 'already current'))
    return changed

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--check', action='store_true')
    a = p.parse_args()
    apply(a.root, a.check)
