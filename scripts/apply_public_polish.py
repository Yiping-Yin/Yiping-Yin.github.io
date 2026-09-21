"""Finish the three approved presentation changes without changing runtime/data.

Generate an explicitly mapped IDE presentation module instead of replacing or
mutating the React tree. The source bundle digest pins the reviewed input.
"""
from __future__ import annotations
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MARK='<!-- public-polish:v1 -->'
STYLE='<link rel="stylesheet" href="/portfolio-assets/polish.css?v=1">'

def replace_once(s,old,new):
    if old not in s and s.count(new)==1:return s
    if s.count(old)!=1:raise ValueError('Unexpected presentation source: '+old[:90])
    return s.replace(old,new,1)

def derive_studio(root):
    source=(root/'portfolio-assets/studio-copy-v1.js').read_text()
    expected=json.loads((root/'scripts/polish_inputs.json').read_text())['studioSHA256']
    if hashlib.sha256(source.encode()).hexdigest()!=expected:raise ValueError('IDE source changed; review required')
    old='e.jsxs("div",{className:"ev-digest","data-state":h,children:[e.jsx("span",{children:"SHA-256"}),e.jsx("code",{"aria-label":"Source SHA-256",children:a.match(/.{1,16}/g)?.map((u,l)=>e.jsx("span",{children:u},l))}),e.jsxs("span",{className:"ev-verdict",role:"status",children:[e.jsx("i",{"aria-hidden":"true"}),i]})]})'
    new='e.jsxs("div",{className:"ev-digest","data-state":h,children:[e.jsxs("span",{className:"ev-verdict",role:"status",children:[e.jsx("i",{"aria-hidden":"true"}),i]}),e.jsxs("details",{className:"polish-source-digest",children:[e.jsx("summary",{children:"Source SHA-256"}),e.jsx("code",{"aria-label":"Source SHA-256",children:a.match(/.{1,16}/g)?.map((u,l)=>e.jsx("span",{children:u},l))})]})]})'
    source=replace_once(source,old,new)
    start=source.index('x&&e.jsx("aside",{className:"ev-engine",children:')
    tail=']},n))})]})})'
    end=source.index(tail,start)+len(tail)
    old=source[start:end]
    prefix='x&&e.jsx("aside",{className:"ev-engine",children:'
    if not old.startswith(prefix) or not old.endswith('})'):raise ValueError('Unexpected engine specification node')
    table=old[len(prefix):-2]
    new='x&&e.jsxs("details",{className:"ev-engine polish-engine-details",children:[e.jsx("summary",{children:"Engine specification"}),'+table+']})'
    return replace_once(source,old,new)

def transform(name,s):
    if MARK in s:return s
    if name=='index.html':
        mapping=json.loads(re.search(r'<script id="p2-run-map" type="application/json">(.*?)</script>',s,re.S)[1]);symbol=mapping['defaultSymbol'];r=mapping['runs'][symbol]
        s=replace_once(s,'class="p2-current-run"','class="p2-current-run ground-terminal"')
        old=re.search(r'<strong id="p2-current-label">.*?</strong>',s)[0]
        s=replace_once(s,old,f'<strong id="p2-current-label">{symbol} · {r["title"]}</strong>')
        old='</strong></p></div><nav class="p2-actions" aria-label="Open the terminal run">'
        new='</strong></p><p id="p2-replay-at">Replay position shown in the chart above</p><p id="p2-completed-outcome">Full-run outcome: '+f'{r["netPnl"]:+.2f} USD · {r["fillCount"]} fills'+'</p><details class="polish-run-details"><summary>Run identity</summary><code id="p2-current-id">'+r['runId']+'</code></details></div><nav class="p2-actions" aria-label="Open the terminal run">'
        s=replace_once(s,old,new)
        s=s.replace('home-runs.mjs?v=p2-1','home-runs.mjs?v=polish-1')
    elif name=='lab.html':
        s=replace_once(s,'<span class="lab-stamp">Verified 14 Sep 2026</span><span class="lab-chip">Notes not published</span>','<span class="lab-stamp">Public research</span><span class="lab-chip">Methods &amp; case archives</span>')
        feature='''<section id="lab-featured-research" class="polish-featured" aria-labelledby="lab-featured-title">
<p class="p2-kicker">Selected public research</p><h2 id="lab-featured-title">Algothon 2026</h2>
<p>Cross-sectional forecasting under a limited effective sample. Explore the method, competition results and evidence limits in the public case.</p>
<nav class="p2-actions" aria-label="Algothon research materials"><a href="/research-algothon.html">Read the research case →</a><a href="https://github.com/Yiping-Yin/algothon-2026/blob/main/Algothon-Research-Report.pdf">Research report · PDF</a><a href="https://github.com/Yiping-Yin/algothon-2026">Code and materials</a></nav>
</section>
'''
        s=replace_once(s,'  <dl class="lab-scope">',feature+'  <dl class="lab-scope">')
        old=re.search(r'<section class="lab-panel" aria-labelledby="lab-bounds-h">.*?</section>',s,re.S)[0]
        body=re.search(r'<dl class="lab-bounds">.*?</dl>',old,re.S)[0]
        new='<details id="lab-publication-scope" class="polish-scope"><summary id="lab-bounds-h">Publication scope and execution boundaries</summary>'+body+'</details>'
        s=replace_once(s,old,new)
    elif name=='training.html':
        needle='    <script type="module" crossorigin src="/portfolio-assets/training-copy-v1.js"></script>'
        imap='<script type="importmap">{"imports":{"/portfolio-assets/studio-copy-v1.js":"/portfolio-assets/studio-details-v1.js"}}</script>\n'
        s=replace_once(s,needle,imap+needle)
    else:raise ValueError('Unreviewed page')
    return replace_once(s,'</head>',MARK+'\n'+STYLE+'\n</head>')

def apply(root=ROOT,check=False):
    root=Path(root);updates={n:transform(n,(root/n).read_text()) for n in ['index.html','lab.html','training.html']}
    updates['portfolio-assets/studio-details-v1.js']=derive_studio(root)
    verifier='scripts/verify_public_release.py'
    updates[verifier]=(root/verifier).read_text() if "'publicDemo'" in (root/verifier).read_text() else replace_once((root/verifier).read_text(), "['publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes']", "['publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes', 'publicPolish']")
    generator='scripts/apply_public_four_fixes.py'
    updates[generator]=replace_once((root/generator).read_text(), 'updates[verifier] = once((root / verifier).read_text(),', 'updates[verifier] = (root / verifier).read_text() if "\'publicFourFixes\', \'publicPolish\'" in (root / verifier).read_text() else once((root / verifier).read_text(),')
    browser='tests/copy_browser.py'
    updates[browser]=(root/browser).read_text() if "'studio-demo-v1.js'}<=loaded" in (root/browser).read_text() else replace_once((root/browser).read_text(), "'studio-copy-v1.js'}<=loaded", "'studio-details-v1.js'}<=loaded")
    release=json.loads((root/'release.json').read_text());sha=lambda data:hashlib.sha256(data).hexdigest()
    hashes={k:sha(v.encode()) for k,v in updates.items()}
    for group in ['publicEnhancements','publicP2','publicCopy','publicFourFixes']:
        for name in release[group]['files']:
            if name in hashes:release[group]['files'][name]=hashes[name]
            elif name=='portfolio-assets/home-runs.mjs':release[group]['files'][name]=sha((root/name).read_bytes())
    release['publicPolish']={'version':'polish-20260921-v1','files':{'portfolio-assets/polish.css':sha((root/'portfolio-assets/polish.css').read_bytes()),'portfolio-assets/studio-details-v1.js':hashes['portfolio-assets/studio-details-v1.js']},'note':'Presentation only; original runtime modules, strategies, tapes and published results are retained.'}
    updates['release.json']=json.dumps(release,indent=2,ensure_ascii=False)+'\n'
    changed=[n for n,s in updates.items() if not(root/n).exists() or (root/n).read_text()!=s]
    if check and changed:raise SystemExit('Polish regeneration required: '+', '.join(changed))
    if not check:
        for n in changed:(root/n).write_text(updates[n],encoding='utf-8',newline='')
    print('Presentation polish: '+(', '.join(changed) if changed else 'already current'))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--check',action='store_true');a=p.parse_args();apply(a.root,a.check)
