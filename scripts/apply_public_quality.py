"""Four approved quality fixes. Preserve all producing engines and public records.

Run after apply_public_demo.py. New presentation derivatives share its React
instance through an import map. Validate every pinned input before any write.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
from public_clean import training as clean_training, review as clean_review, page as clean_page

ROOT = Path(__file__).resolve().parents[1]
MARK = '<!-- public-quality:v1 -->'
# Filled from the accepted 083ca17 tree, not from modified/generated output.
INPUTS = {'portfolio-assets/training-demo-v1.js': 'f7f43e91b51bff04cc8eea608312fbe96390dfd5e1315c7259d6f3a1e7284fff', 'portfolio-assets/review-copy-v1.js': 'bb903e3c739ed9c38948817b9db154eb96f46e5a5fc598b0dd72b89aee3cc880', 'portfolio-assets/market-copy-v1.js': '6ba9e8109265993432804cbfdb2c3496c0238db161095802a11e13ca0cb91c87'}

def once(text, old, new):
    if old not in text and new in text:
        return text
    if text.count(old) != 1:
        raise ValueError('Unreviewed quality input structure: ' + old[:90])
    return text.replace(old, new, 1)

def names(text):
    for old,new in [('Open IDE','View source'),('Load inputs in IDE','Open strategy inputs'),
                    ('Load run in IDE','Load published source'),('IDE source','Strategy source'),
                    ('Current IDE draft','Current strategy draft')]:
        text = text.replace(old,new)
    return text

def derive_training(source):
    source = names(source)
    source = once(source, '[Bn,Nn]=R.useState(0),', '[Bn,Nn]=R.useState(0),[qualityHref,qualitySetHref]=R.useState(()=>location.href),')
    hook = '''R.useEffect(()=>{const update=()=>qualitySetHref(location.href);addEventListener("hashchange",update);addEventListener("popstate",update);return()=>{removeEventListener("hashchange",update);removeEventListener("popstate",update)}},[]);
R.useEffect(()=>{if(!dt||!Zt?.published)return;const moment=qualityReadMoment(qualityHref,Zt);if(moment.status==="valid")Nn(moment.cursor);else if(moment.status==="invalid")Nn(dt.fills[0]?.barIndex||0)},[qualityHref,dt?.runId]);
'''
    source = once(source, 'async function Qn(', hook + 'async function Qn(')
    source = once(source, 'const H=b.current,V=H.pause;',
                  'const H=b.current,V=H.pause;R.useEffect(()=>pauseWhenHidden(V),[V]);')
    source = once(source, 'window.setTimeout(()=>{H.run(!0)},1e3/k)',
                  'window.setTimeout(()=>{if(!document.hidden)H.run(!0)},1e3/k)')
    return 'import {pauseWhenHidden} from "./playback-lifecycle.mjs";\nimport {readReplayMoment as qualityReadMoment} from "./quality-model.mjs";\n' + clean_training(source)

def derive_review(source):
    source = names(source)
    source = once(source, 't={fees:n,slippagePaid:r', 't={drawdown:qualityDrawdown(s.equity,s.metrics.initialEquity),fees:n,slippagePaid:r')
    source = once(source, '`${N(o.trough.equity,f)} at ${o.trough.label}`',
                  'o.drawdown.trough?`${N(o.drawdown.trough.equity,f)} at ${o.drawdown.trough.label}; peak ${N(o.drawdown.peak.equity,f)} at ${o.drawdown.peak.label}`:"No decline from a prior peak"')
    source = once(source, 'e.jsx(_e,{result:n,e:o})', 'e.jsx(QualityDrawdownChart,{result:n,e:o})')
    start, end = source.index('function _e('), source.index('function Ve(')
    if end <= start: raise ValueError('Unexpected report chart boundary')
    source = source[:start] + source[end:]
    source = once(source, 'className:"rr-trips",children:', 'className:"rr-trips",role:"region",tabIndex:0,"aria-label":"Round trips; scroll horizontally for all columns",children:')
    source = once(source, 'id:"rr-matrix",tabIndex:"-1",children:', 'id:"rr-matrix",role:"region",tabIndex:0,"aria-label":"Published strategy comparison; scroll horizontally for all columns",children:')
    return 'import {drawdownRange as qualityDrawdown} from "./quality-model.mjs";\nimport {DrawdownChart as QualityDrawdownChart} from "./quality-ui.mjs";\n' + clean_review(source)

def derive_market(source):
    source = names(source)
    source = once(source, 'children:[D,m?.published&&te&&',
                  'children:[D,e.jsx(QualityReplayShare,{entry:m,cursor:a,onPause:()=>j(!1),loading:T}),m?.published&&te&&')
    source = once(source, 'o.useEffect(()=>{j(!1)},[ee]),',
                  'o.useEffect(()=>{j(!1)},[ee]),o.useEffect(()=>pauseWhenHidden(()=>j(!1)),[]),')
    source = once(source, 'window.setInterval(()=>L(r=>Math.min(u,r+1)),1e3/U)',
                  'window.setInterval(()=>{if(!document.hidden)L(r=>Math.min(u,r+1))},1e3/U)')
    return 'import {pauseWhenHidden} from "./playback-lifecycle.mjs";\nimport {ReplayShare as QualityReplayShare} from "./quality-ui.mjs";\n' + source

def page(name, text):
    # General entrances only. Exact-run URLs and explicit synthetic links survive.
    for route in ('market','training','studio'):
        text = text.replace(f'href="/training.html#/{route}"',f'href="/training.html?market=historical#/{route}"')
    if name == 'training.html':
        match = re.search(r'<script type="importmap">(.*?)</script>',text)
        if not match: raise ValueError('Missing shared runtime import map')
        imports = json.loads(match[1])
        for old,new in [('training-copy-v1.js','training-quality-v1.js'),('training-demo-v1.js','training-quality-v1.js'),
                        ('review-copy-v1.js','review-quality-v1.js'),('market-copy-v1.js','market-quality-v1.js')]:
            imports['imports']['/portfolio-assets/'+old] = '/portfolio-assets/'+new
        text = text[:match.start(1)] + json.dumps(imports,separators=(',',':')) + text[match.end(1):]
        text = text.replace('crossorigin src="/portfolio-assets/training-demo-v1.js"', 'crossorigin src="/portfolio-assets/training-quality-v1.js"')
    if name in ('training.html','lab.html') and MARK not in text:
        text = once(text,'</head>',MARK+'\n<link rel="stylesheet" href="/portfolio-assets/quality.css?v=quality-1">\n</head>')
        text,count = re.subn(r'<body(?=[\s>])', '<body data-quality="v1"', text, count=1)
        if count != 1: raise ValueError('Missing page body')
    return clean_page(name, text)

def apply(root=ROOT, check=False):
    root = Path(root)
    immutable = json.loads((root/'scripts/presentation_copy.json').read_text())['immutableInputs']
    for name,digest in {**immutable,**INPUTS}.items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest() != digest:
            raise ValueError('Quality input changed; review required: '+name)
    updates = {p.name:page(p.name,p.read_text()) for p in root.glob('*.html')}
    template = 'scripts/public_p2_pages.py'
    updates[template] = page(template, (root/template).read_text())
    for old,new,derive in [('training-demo-v1.js','training-quality-v1.js',derive_training),
                           ('review-copy-v1.js','review-quality-v1.js',derive_review),
                           ('market-copy-v1.js','market-quality-v1.js',derive_market)]:
        updates['portfolio-assets/'+new] = derive((root/'portfolio-assets'/old).read_text())
    verifier = 'scripts/verify_public_release.py'
    updates[verifier] = once((root/verifier).read_text(), "'publicDemo']", "'publicDemo', 'publicQuality']")
    # The previous generator owns its original derivatives, not the final routing layer.
    previous = 'scripts/apply_public_demo.py'
    updates[previous] = once((root/previous).read_text(),
        'updates[verifier] = once((root / verifier).read_text(),',
        'updates[verifier] = (root / verifier).read_text() if "\'publicQuality\'" in (root / verifier).read_text() else once((root / verifier).read_text(),')
    # Update only superseded entry/module expectations. All functional tests remain.
    test = 'tests/demo_acceptance.py'
    text = (root/test).read_text()
    text = once(text, "self.assertEqual(imports['/portfolio-assets/training-copy-v1.js'], '/portfolio-assets/training-demo-v1.js')",
        "entry = '/portfolio-assets/training-quality-v1.js?v=detail-1' if 'public-clean:v1' in page else ('/portfolio-assets/training-quality-v1.js' if 'public-quality:v1' in page else '/portfolio-assets/training-demo-v1.js')\n        self.assertEqual(imports['/portfolio-assets/training-copy-v1.js'], entry)")
    text = once(text, "self.assertIn('crossorigin src=\"/portfolio-assets/training-demo-v1.js\"', page)", "self.assertIn('crossorigin src=\"' + entry + '\"', page)")
    updates[test] = text
    test = 'tests/copy_browser.py'
    old = "{'training-demo-v1.js','review-copy-v1.js','market-copy-v1.js','studio-demo-v1.js'}<=loaded"
    new = old + " or {'training-quality-v1.js','review-quality-v1.js','market-quality-v1.js','studio-demo-v1.js'}<=loaded"
    text = (root/test).read_text()
    updates[test] = text if new in text else once(text,old,new)
    release = json.loads((root/'release.json').read_text())
    hashes = {name:hashlib.sha256(text.encode()).hexdigest() for name,text in updates.items()}
    for group in ('publicEnhancements','publicP2','publicCopy','publicFourFixes','publicPolish','publicDemo'):
        for name in release[group]['files']:
            if name in hashes: release[group]['files'][name] = hashes[name]
    files = {name:digest for name,digest in hashes.items() if name.endswith('-quality-v1.js')}
    for name in ('quality-model.mjs','quality-ui.mjs','quality.css','clean.css','playback-lifecycle.mjs'):
        path='portfolio-assets/'+name
        files[path]=hashlib.sha256((root/path).read_bytes()).hexdigest()
    release['publicQuality']={'version':'quality-20260921-v1','files':files,
        'note':'Presentation-only: consistent entrances, chronological drawdown labels, public replay bookmarks and narrow-screen reading. Original inputs and results are unchanged.'}
    updates['release.json'] = json.dumps(release,indent=2,ensure_ascii=False)+'\n'
    changed=[n for n,text in updates.items() if not (root/n).exists() or (root/n).read_text()!=text]
    if check and changed: raise SystemExit('Quality regeneration required: '+', '.join(changed))
    if not check:
        for name in changed: (root/name).write_text(updates[name],encoding='utf-8',newline='')
    print('Public quality: '+(', '.join(changed) if changed else 'already current'))
    return changed

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--check',action='store_true')
    args=parser.parse_args();apply(args.root,args.check)
