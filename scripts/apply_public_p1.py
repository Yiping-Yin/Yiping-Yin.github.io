"""Reproducible, fail-closed post-export changes for UPGRADE_PLAN P1.

This operates only on public HTML; it never reads the private P.Book source or
vault. Original compiled bundles, financial data and strategy results are kept.
Run after build:public when the matching source checkpoint is available again.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'ab5dba4e7af2e19854fc133998dff3e7d84b6f98'
MARK = '<!-- public-p1:v1 -->'
REPORT = 'https://github.com/Yiping-Yin/algothon-2026/blob/main/Algothon-Research-Report.pdf'
CODE = 'https://github.com/Yiping-Yin/algothon-2026'
RUN = '3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'
PROJECTS = {
 'Cross-asset market making &amp; execution': 'market-making',
 'Order-book analytics &amp; ETF pricing': 'etf-pricing',
 'P.Book — training desk &amp; strategy engine': 'pbook',
 'Explaining Markets — earnings-reaction forecasting': 'explaining-markets',
 'Signal Mosaic — market &amp; news analytics': 'signal-mosaic',
 'Evidence-grounded financial agents': 'financial-agents',
 'Agent society &amp; strategic simulation': 'agent-society',
 'Latent-Agent Market Simulation': 'latent-agent',
 'PittsAI — customer simulation': 'pittsai',
}

def replace_once(text, old, new):
    count = text.count(old)
    if count != 1:
        raise ValueError(f'Expected exactly one public marker, found {count}: {old[:110]}')
    return text.replace(old, new, 1)

def link(url, label):
    return f'<a href="{html.escape(url, quote=True)}">{html.escape(label)}</a>'

def evidence_links():
    return '<span class="p1-evidence-links">' + link(REPORT,'Research report · PDF') + link(CODE,'Code and materials') + '</span>'

def run_url(view):
    return f'/training.html?market=historical#/market?view={view}&run={RUN}'

def run_links():
    return '<span class="p1-evidence-links">' + ''.join([
      link(run_url('review'),'AAPL trend report'), link(run_url('replay'),'Replay AAPL trend'),
      link('/#published-runs','All 15 published runs'),
      link('/training.html?market=historical#/market','Historical desk'),
    ]) + '</span>'

def transform(name, text):
    if MARK in text: return text
    if name == 'index.html':
        text = replace_once(text, '<li>Algothon 2026 <small>Sealed archive</small></li>',
            '<li id="lab-archive-algothon" class="p1-public-archive">Algothon 2026 <small>Public report and code</small>' + evidence_links() + '</li>')
        text = replace_once(text, '<div class="s1-runs">', '<div class="s1-runs" id="published-runs" tabindex="-1">')
    elif name == 'lab.html':
        old = '<tr><td class="idx">04</td><th scope="row">Algothon 2026</th><td class="soft">Sealed archive</td></tr>'
        new = '<tr id="archive-algothon"><td class="idx">04</td><th scope="row">Algothon 2026</th><td class="soft">Public report and code' + evidence_links() + '</td></tr>'
        text = replace_once(text, old, new)
        text = replace_once(text, '<a href="/training.html#/market">Training <span aria-hidden="true">→</span></a>', run_links())
    elif name == 'profile.html':
        text = replace_once(text, '<article class="featured-project">', '<article class="featured-project" id="project-algothon" tabindex="-1">')
        pattern = r'(<article class="featured-project"[^>]*>.*?</h3>)'
        text, count = re.subn(pattern, lambda m: m[1] + '\n    ' + evidence_links() + '\n    <a class="p1-project-link" href="#project-algothon">Link to this project</a>', text, count=1, flags=re.S)
        if count != 1: raise ValueError('Featured project structure changed')
        for title, slug in PROJECTS.items():
            pattern = r'<details class="project-study">(?=\s*<summary><span class="study-head"><strong>' + re.escape(title) + '</strong>)'
            opening = f'<details class="project-study" id="project-{slug}">'
            text, count = re.subn(pattern, opening, text)
            if count != 1: raise ValueError(f'Project structure changed: {slug}')
            pattern = re.escape(opening) + r'(.*?<div class="study-body">)'
            text, count = re.subn(pattern, lambda m: opening + m[1] + f'<a class="p1-project-link" href="#project-{slug}">Link to this project</a>', text, count=1, flags=re.S)
            if count != 1: raise ValueError(f'Project body changed: {slug}')
        text = replace_once(text, '<a class="text-link" href="/training.html#/market">Open the desk <span aria-hidden="true">→</span></a>', run_links())
    elif name == 'training.html':
        text = replace_once(text, '</head>', '    <script type="module" src="/portfolio-assets/source-export.mjs?v=p1-1"></script>\n  </head>')
    text = replace_once(text, '</head>', MARK + '\n<link rel="stylesheet" href="/portfolio-assets/p1-evidence.css?v=p1-1">\n</head>')
    return text

def apply(root=ROOT, check=False):
    root = Path(root)
    pages = ['index.html','profile.html','lab.html','training.html']
    updates = {name: transform(name,(root/name).read_text(encoding='utf-8')) for name in pages}
    # Compute everything before writing: a mismatched export cannot be half patched.
    release = json.loads((root/'release.json').read_text())
    files = {name: hashlib.sha256(text.encode()).hexdigest() for name,text in updates.items()}
    for name in ['portfolio-assets/source-export.mjs','portfolio-assets/p1-evidence.css']:
        files[name] = hashlib.sha256((root/name).read_bytes()).hexdigest()
    release['publicEnhancements'] = {'version':'p1-20260921-v1','baselineCommit':BASE,
        'scope':['P1-01','P1-02','P1-03'], 'files':files,
        'note':'Public post-export enhancement; original engine and published data are unchanged.'}
    updates['release.json'] = json.dumps(release,indent=2,ensure_ascii=False)+'\n'
    changed = [name for name,text in updates.items() if (root/name).read_text(encoding='utf-8') != text]
    if check:
        if changed: raise SystemExit('Public P1 output needs regeneration: '+', '.join(changed))
    else:
        for name in changed: (root/name).write_text(updates[name],encoding='utf-8',newline='')
    print('Public P1: '+(', '.join(changed) if changed else 'already current'))
    return changed

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args();apply(args.root,args.check)
