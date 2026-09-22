"""Four approved presentation changes. No execution, new data or backend.

Run after the existing public generators. Keep upstream bundles byte-for-byte;
import maps make all public views share the one derived React entry module.
"""
from __future__ import annotations
import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import re
from public_clean import studio as clean_studio

ROOT = Path(__file__).resolve().parents[1]
MARK = '<!-- public-demo:v1 -->'
INPUTS = {
    'portfolio-assets/training-copy-v1.js': 'ee57ceacf9a523e3ae68debcf7aca68d1c2d7eee8296931f9df49bc6da79efe9',
    'portfolio-assets/studio-details-v1.js': '5bbc700af68a483f334bca0521a407454ebace4dd4f34b8107f6b61902ae3d2c',
}
DESCRIPTIONS = {
    'trend': 'Follows the 5 / 20 minute moving-average signal.',
    'hold': 'Buys one unit after the first bar, then holds it.',
    'range': 'Enters above the first 15-minute high and exits below its low.',
    'quote': 'Places and replaces quotes in a simulated order book.',
}
# Adapt only expectations explicitly superseded by the approved read-first UI.
COMPAT = {
    'README.md': [("P.Book's Overview, Trading, report/replay and IDE surfaces. The public IDE supports browser-local strategy edits.", "P.Book's Overview, Trading, report/replay and Strategies surfaces. Strategies defaults to source reading, with optional browser-local edits."), ('strategy IDE with four published source files', 'strategy source gallery with four published source files')],
    'scripts/apply_public_polish.py': [
        ('updates[verifier]=replace_once((root/verifier).read_text(),', 'updates[verifier]=(root/verifier).read_text() if "\'publicDemo\'" in (root/verifier).read_text() else replace_once((root/verifier).read_text(),'),
        ('updates[browser]=replace_once((root/browser).read_text(),', 'updates[browser]=(root/browser).read_text() if "\'studio-demo-v1.js\'}<=loaded" in (root/browser).read_text() else replace_once((root/browser).read_text(),')],
    'tests/copy_browser.py': [
        ("expect(self.page.locator('body')).to_contain_text('Execute strategies with the local P.Book runtime.')", "expect(self.page.locator('.demo-source-note')).to_contain_text('this site does not execute Python.')"),
        ("{'training-copy-v1.js','review-copy-v1.js','market-copy-v1.js','studio-details-v1.js'}<=loaded", "{'training-demo-v1.js','review-copy-v1.js','market-copy-v1.js','studio-demo-v1.js'}<=loaded")],
    'tests/four_fixes_browser.py': [("'studio':'IDE'", "'studio':'Strategies'"), ("name='IDE', exact=True", "name='Strategies', exact=True")],
    'tests/polish_browser.py': [("expect(self.page.locator('.ev-runtime')).to_be_visible()", "expect(self.page.locator('.demo-local-details summary')).to_be_visible();expect(self.page.locator('.demo-local-details p')).to_be_hidden()")],
    'tests/p1_browser.py': [("self.studio()  # This public editor is editable directly; there is no Edit button.", "self.studio();self.page.get_by_role('button',name='Edit',exact=True).click()  # Public source is read-only until explicitly edited.")],
}

def once(text, old, new, count=1):
    if old not in text and text.count(new) == count:
        return text
    if text.count(old) != count:
        raise ValueError('Demo source structure changed: ' + old[:100])
    return text.replace(old, new)


def derive_training(source):
    source = once(source, '["studio","IDE"]', '["studio","Strategies"]')
    source = once(source, 'studio:"IDE · P.Book"', 'studio:"Strategies · P.Book"')
    source = once(source, 'Strategy starters, opened in the IDE', 'Strategy starters, opened in Strategies')
    return once(source, '"./studio-copy-v1.js"', '"./studio-demo-v1.js"', 2)


def derive_studio(source):
    # Preserve the editor and its saved drafts; editing becomes opt-in on desktop too.
    source = once(source, 'value:s,onChange:r=>t(r.target.value)', 'value:s,readOnly:!u,"aria-hidden":!u,tabIndex:u?0:-1,onChange:r=>t(r.target.value)')
    source = once(source, 'className:"ev-code","aria-hidden":!f||u', 'className:"ev-code","aria-hidden":u')
    source = once(source, 'children:"IDE"', 'children:"Strategies"', 2)
    old = 's.engineVersion&&e.jsxs(e.Fragment,{children:[e.jsxs("span",{children:["ENGINE ",e.jsx("b",{children:s.engineVersion})]}),e.jsxs("span",{children:["RUNTIME ",e.jsx("b",{children:"local only"})]})]})'
    source = once(source, old, 'e.jsx("span",{children:"Published strategy examples"})')
    old = 'e.jsxs("section",{className:"ev-runtime",children:[e.jsx("h2",{children:"RUN PYTHON LOCALLY"}),e.jsx("p",{children:R})]})'
    new = 'e.jsxs("details",{className:"demo-local-details",children:[e.jsx("summary",{children:"Local execution details"}),e.jsx("p",{children:R})]})'
    source = once(source, old, new)
    descriptions = json.dumps(DESCRIPTIONS, ensure_ascii=False, separators=(',', ':'))
    intro = 'e.jsxs("section",{className:"demo-strategy-intro",children:[e.jsx("h2",{children:i.title}),e.jsx("p",{children:(' + descriptions + ')[i.taskId]}),e.jsx("p",{className:"demo-source-note",children:"Read the published source and replay its results. Edits stay on this device; this site does not execute Python."})]}),'
    source = once(source, 'e.jsxs("div",{className:"ev-main",children:', intro + 'e.jsxs("div",{className:"ev-main",children:')
    # One mounted tab set preserves keyboard focus. Native history events update
    # selection; pushState deliberately does not scroll or clear per-source drafts.
    source = once(source, 'initialTaskId:p=null})', 'initialTaskId:p=null,onTaskChange:Z})')
    source = once(source, 'u=o.useRef([]);if(!i)', 'u=o.useRef([]);o.useEffect(()=>{g(p||s.strategies[0]?.taskId)},[p,s]);if(!i)')
    old = 'j=(n,d=!1)=>{g(s.strategies[n].taskId),d&&u.current[n]?.focus()}'
    new = 'j=(n,d=!1)=>{const c=s.strategies[n].taskId,w=new URL(location.href),z=new URLSearchParams(w.hash.split("?")[1]||"");z.set("source",c);w.hash="/studio?"+z.toString();w.href!==location.href&&history.pushState(history.state,"",w);g(c);Z?.(c);d&&u.current[n]?.focus()}'
    source = once(source, old, new)
    source = once(source, 'return window.addEventListener("hashchange",h),()=>window.removeEventListener("hashchange",h)', 'return window.addEventListener("hashchange",h),window.addEventListener("popstate",h),()=>{window.removeEventListener("hashchange",h);window.removeEventListener("popstate",h)}')
    source = once(source, 'e.jsx(q,{evidence:g,missing:s.missing,initialTaskId:p},p||"default")', 'e.jsx(q,{evidence:g,missing:s.missing,initialTaskId:p,onTaskChange:m})')
    return clean_studio(source)


def selected_runs(root):
    pack = json.loads((root / 'data/published-runs-historical.json').read_text())
    runs = pack['markets']['historical']['runs']
    selected = []
    for task in ('trend', 'hold', 'range'):
        matches = [r for r in runs if r['symbol'] == 'AAPL' and r['taskId'] == task and r['marketKind'] == 'historical']
        if len(matches) != 1:
            raise ValueError('Expected one historical AAPL example per strategy')
        selected.append(matches[0])
    settings = [json.dumps([r['result'][k] for k in ('datasetId', 'datasetChecksum', 'config', 'policy')], sort_keys=True) for r in selected]
    if len(set(settings)) != 1:
        raise ValueError('Featured strategies must use matching data and execution settings')
    return selected


def featured_html(runs):
    rows = ['<section class="demo-featured-runs" aria-label="Selected strategy runs">']
    for run in runs:
        ident = run['result']['runId']
        if not re.fullmatch('[0-9a-f]{64}', ident):
            raise ValueError('Invalid published run identity')
        metrics = run['result']['metrics']
        task = run['taskId']
        pnl = metrics['netPnl']
        tone = 'num-up' if pnl > 0 else 'num-down' if pnl < 0 else 'num-flat'
        replay = '/training.html?market=historical#/market?view=replay&amp;run=' + ident
        report = replay.replace('view=replay', 'view=review')
        source = '/training.html?market=historical#/studio?source=' + task
        rows.append(f'''<article data-run-id="{ident}">
<p class="demo-run-market"><span data-demo-symbol>AAPL</span> · 10 Sep 2026</p>
<h3>{escape(run['title'])}</h3><p class="demo-run-description">{escape(DESCRIPTIONS[task])}</p>
<p class="demo-run-outcome">Net P&amp;L <b class="num-signed {tone}">{pnl:+.2f} USD</b><span>{metrics['fillCount']} fills</span></p>
<nav aria-label="{escape(run['title'])} example"><a href="{replay}">Replay</a><a href="{source}">Source</a><a href="{report}">Report</a></nav>
</article>''')
    rows.append('</section>')
    return '\n'.join(rows)


def transform_home(text, runs):
    if MARK in text:
        start = text.index('<section class="demo-featured-runs"')
        end = text.index('</section>', start) + len('</section>')
        return text[:start] + featured_html(runs) + text[end:]
    text = once(text, '<a href="/training.html#/market">Trading ', '<a href="/training.html?market=historical#/market">Trading ')
    text = once(text, '<a href="/training.html#/studio">IDE ', '<a href="/training.html?market=historical#/studio">Strategies ')
    text = once(text, '<a href="/training.html#/training">P.Book ', '<a href="/training.html?market=historical#/training">P.Book ')
    start = text.index('<div class="s1-runs" id="published-runs" tabindex="-1">')
    end = text.index('\n  <dl class="s1-spec">', start)
    archive = text[start:end]
    rule = re.search(r'<caption>Published runs <span>(.*?)</span></caption>', archive, re.S)
    if not rule:
        raise ValueError('Published rules missing')
    rules = rule[1]
    archive = once(archive, '<div class="s1-runs" id="published-runs" tabindex="-1">', '<details class="s1-runs demo-archive" id="published-runs" tabindex="-1"><summary>View all 15 published runs</summary>')
    archive = once(archive, '<caption>Published runs <span>' + rules + '</span></caption>', '<caption>Published runs <span>Historical outcomes in USD; synthetic outcomes in SIM.</span></caption>', 2)
    cut = archive.rfind('</div>')
    if cut < 0 or archive[cut + 6:].strip():
        raise ValueError('Unexpected published-runs boundary')
    archive = archive[:cut] + '</details>' + archive[cut + 6:]
    text = text[:start] + '<p class="demo-selection-note">Three strategies on the same AAPL session. Selected by method, not by return.</p>\n' + featured_html(runs) + '\n' + archive + text[end:]
    spec = re.search(r'<dl class="s1-spec">.*?</dl>', text, re.S)
    if not spec:
        raise ValueError('Execution specification missing')
    text = once(text, spec[0], '<details class="demo-run-rules"><summary>Data and execution rules</summary><p>' + rules + '</p>' + spec[0] + '</details>')
    return add_style(text)


def add_style(text):
    if MARK not in text:
        text = once(text, '</head>', MARK + '\n<link rel="stylesheet" href="/portfolio-assets/demo.css?v=demo-1">\n</head>')
    return text


def transform_training(text):
    if MARK in text:
        return text
    old = '<script type="importmap">{"imports":{"/portfolio-assets/studio-copy-v1.js":"/portfolio-assets/studio-details-v1.js"}}</script>'
    imports = {'/portfolio-assets/studio-copy-v1.js': '/portfolio-assets/studio-demo-v1.js', '/portfolio-assets/training-copy-v1.js': '/portfolio-assets/training-demo-v1.js'}
    text = once(text, old, '<script type="importmap">' + json.dumps({'imports': imports}, separators=(',', ':')) + '</script>')
    text = once(text, 'crossorigin src="/portfolio-assets/training-copy-v1.js"', 'crossorigin src="/portfolio-assets/training-demo-v1.js"')
    return add_style(text)


def apply(root=ROOT, check=False):
    root = Path(root)
    immutable = json.loads((root / 'scripts/presentation_copy.json').read_text())['immutableInputs']
    for name, digest in {**immutable, **INPUTS}.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise ValueError('Demo input changed; review required: ' + name)
    updates = {
        'index.html': transform_home((root / 'index.html').read_text(), selected_runs(root)),
        'training.html': transform_training((root / 'training.html').read_text()),
        'portfolio-assets/training-demo-v1.js': derive_training((root / 'portfolio-assets/training-copy-v1.js').read_text()),
        'portfolio-assets/studio-demo-v1.js': derive_studio((root / 'portfolio-assets/studio-details-v1.js').read_text()),
    }
    for name, replacements in COMPAT.items():
        text = (root / name).read_text()
        for old, new in replacements:
            text = once(text, old, new, 2 if name == 'tests/p1_browser.py' else 1)
        updates[name] = text
    verifier = 'scripts/verify_public_release.py'
    updates[verifier] = (root / verifier).read_text() if "'publicQuality'" in (root / verifier).read_text() else once((root / verifier).read_text(), "'publicFourFixes', 'publicPolish']", "'publicFourFixes', 'publicPolish', 'publicDemo']")
    release = json.loads((root / 'release.json').read_text())
    hashes = {name: hashlib.sha256(text.encode()).hexdigest() for name, text in updates.items()}
    for group in ('publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes', 'publicPolish'):
        for name in release[group]['files']:
            if name in hashes:
                release[group]['files'][name] = hashes[name]
    files = {name: hashes[name] for name in ('portfolio-assets/training-demo-v1.js', 'portfolio-assets/studio-demo-v1.js')}
    files['portfolio-assets/demo.css'] = hashlib.sha256((root / 'portfolio-assets/demo.css').read_bytes()).hexdigest()
    release['publicDemo'] = {'version': 'demo-20260921-v1', 'files': files, 'note': 'Four approved presentation changes. Original runtime bundles, strategy sources, tapes and all published results are retained.'}
    updates['release.json'] = json.dumps(release, indent=2, ensure_ascii=False) + '\n'
    changed = [name for name, text in updates.items() if not (root / name).exists() or (root / name).read_text() != text]
    if check and changed:
        raise SystemExit('Demo regeneration required: ' + ', '.join(changed))
    if not check:
        for name in changed:
            (root / name).write_text(updates[name], encoding='utf-8', newline='')
    print('Lightweight demo: ' + (', '.join(changed) if changed else 'already current'))
    return changed

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    apply(args.root, args.check)
