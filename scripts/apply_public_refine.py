"""Approved portfolio refinements on top of the current public-quality release.
Run last. Preserve all original/runtime/quality inputs; only derive presentation.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
MARK='<!-- public-refine:v1 -->'
MARKET='portfolio-assets/market-quality-v1.js'
MARKET_SHA='e26747b0b998e306969f2bd7bfb7edc50f55b7c3c7e1225027e8512ce525584d'
INTRO='''<!-- public-visual:intro:start -->
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
OLD_EFFECT='if(!v||x!=="trading"||!t||!C||c)return;const s=window.setInterval(()=>L(r=>Math.min(u,r+1)),1e3/U);return()=>window.clearInterval(s)'
NEW_EFFECT='''if(!v||x!=="trading"||!t||!C||c)return;
let timer=null;
const stop=()=>{if(timer!==null){window.clearInterval(timer);timer=null}};
const pause=()=>{stop();j(!1)};
const visibility=()=>{if(document.hidden)pause()};
document.addEventListener("visibilitychange",visibility);
window.addEventListener("pagehide",pause);
if(document.hidden)pause();
else timer=window.setInterval(()=>{if(document.hidden){pause();return}L(r=>Math.min(u,r+1))},1e3/U);
return()=>{stop();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",pause)}'''

def once(text,old,new):
    if old not in text and text.count(new)==1:return text
    if text.count(old)!=1:raise ValueError('Refinement source structure changed: '+old[:100])
    return text.replace(old,new,1)

def derive_market(source):
    if hashlib.sha256(source.encode()).hexdigest()!=MARKET_SHA:
        raise ValueError('Unreviewed replay input')
    return once(source,OLD_EFFECT,NEW_EFFECT)

def apply(root=ROOT,check=False):
    root=Path(root);updates={}
    # Validate before staging any writes. No original bundle or public data edits.
    immutable=json.loads((root/'scripts/presentation_copy.json').read_text())['immutableInputs']
    for name,digest in {**immutable,MARKET:MARKET_SHA}.items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
            raise ValueError('Refinement input changed: '+name)
    css=['portfolio-assets/home-visual.css','portfolio-assets/home-refine.css']
    css_hash={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in css}
    home=(root/'index.html').read_text()
    home=once(home,'<body class="semicircle-study">','<body class="semicircle-study blue-white-home">')
    home=once(home,'<h1 class="sr-only">Yiping Yin — quantitative research and trading</h1>',INTRO)
    if MARK in home:
        home,count=re.subn(re.escape(MARK)+r'\n(?:<link rel="stylesheet" href="/portfolio-assets/home-(?:visual|refine)\.css\?v=[0-9a-f]{12}">\n){2}','',home)
        if count!=1:raise ValueError('Invalid refinement style marker')
    styles=MARK+'\n'+''.join(f'<link rel="stylesheet" href="/{n}?v={css_hash[n][:12]}">\n' for n in css)
    home=once(home,'</head>',styles+'</head>')
    # Edit only the three curated cards; keep archive links and every run ID.
    def card(match):
        text=match[0]
        for old,new in [('>Replay</a>','>Watch replay</a>'),('>Source</a>','>View source</a>'),('>Report</a>','>Read report</a>')]:
            text=once(text,old,new)
        return text.replace('<span>1 fills</span>','<span>1 fill</span>')
    home,count=re.subn(r'<article data-run-id="[0-9a-f]{64}">.*?</article>',card,home,flags=re.S)
    if count!=3:raise ValueError('Expected exactly three curated cards')
    # Keep the precise original full-demo route; change its visible action only.
    home,count=re.subn(r'(<div class="th-footer">.*?<a href="[^"]+">)(?:Training|Open full demo)( <span)',r'\1Open full demo\2',home,flags=re.S)
    if count!=1:raise ValueError('Missing terminal entry')
    updates['index.html']=home
    profile=(root/'profile.html').read_text()
    sentence=' The final technical result was 0.4 of one block’s standard error from the public-data replay mean, 3.7 points behind second place.'
    if sentence in profile:profile=once(profile,sentence,'')
    if profile.count('3.7 points')!=1 or profile.count('0.4 of one block')!=1:
        raise ValueError('Profile evidence comparison changed')
    updates['profile.html']=profile
    updates['portfolio-assets/market-refine-v1.js']=derive_market((root/MARKET).read_text())
    training=(root/'training.html').read_text()
    match=re.search(r'<script type="importmap">(.*?)</script>',training)
    if not match:raise ValueError('Missing runtime import map')
    imports=json.loads(match[1]);imports['imports']['/portfolio-assets/market-copy-v1.js']='/portfolio-assets/market-refine-v1.js'
    training=training[:match.start(1)]+json.dumps(imports,separators=(',',':'))+training[match.end(1):]
    if MARK not in training:training=once(training,'</head>',MARK+'\n</head>')
    updates['training.html']=training
    # Update the owning generator, not merely its generated HTML, for stable --check.
    p='scripts/apply_public_demo.py';text=(root/p).read_text()
    text=once(text,"{metrics['fillCount']} fills", "{metrics['fillCount']} {'fill' if metrics['fillCount'] == 1 else 'fills'}")
    for old,new in [('>Replay</a>','>Watch replay</a>'),('>Source</a>','>View source</a>'),('>Report</a>','>Read report</a>')]:text=once(text,old,new)
    updates[p]=text
    p='scripts/apply_public_quality.py';text=(root/p).read_text()
    line="            imports['imports']['/portfolio-assets/'+old] = '/portfolio-assets/'+new"
    revised="            if MARK_REFINE in text and old == 'market-copy-v1.js': new = 'market-refine-v1.js'\n"+line
    revised=revised.replace('MARK_REFINE',repr(MARK))
    updates[p]=text if revised in text else once(text,line,revised)
    # Only the approved labels/derivative URL supersede existing expectations.
    p='tests/demo_acceptance.py';text=(root/p).read_text()
    updates[p]=once(text,"{run['result']['metrics']['fillCount']} fills", "{run['result']['metrics']['fillCount']} {'fill' if run['result']['metrics']['fillCount'] == 1 else 'fills'}")
    p='tests/demo_browser.py';text=(root/p).read_text()
    text=once(text,"name='Replay', exact=True","name='Watch replay', exact=True")
    text=once(text,"name='Source', exact=True","name='View source', exact=True")
    updates[p]=text
    p='tests/copy_browser.py';text=(root/p).read_text()
    old="{'training-quality-v1.js','review-quality-v1.js','market-quality-v1.js','studio-demo-v1.js'}<=loaded"
    new=old+" or {'training-quality-v1.js','review-quality-v1.js','market-refine-v1.js','studio-demo-v1.js'}<=loaded"
    updates[p]=text if new in text else once(text,old,new)
    p='tests/quality_acceptance.py';text=(root/p).read_text()
    old="for view in ('review','market'):self.assertEqual(imports[f'/portfolio-assets/{view}-copy-v1.js'],f'/portfolio-assets/{view}-quality-v1.js')"
    new="for view in ('review','market'):\n            variant='refine' if view=='market' and 'public-refine:v1' in text else 'quality'\n            self.assertEqual(imports[f'/portfolio-assets/{view}-copy-v1.js'],f'/portfolio-assets/{view}-{variant}-v1.js')"
    updates[p]=once(text,old,new)
    p='scripts/verify_public_release.py';text=(root/p).read_text()
    updates[p]=once(text,"'publicQuality']:","'publicQuality'] + ['publicRefine']:")
    release=json.loads((root/'release.json').read_text())
    hashes={n:hashlib.sha256(v.encode()).hexdigest() for n,v in updates.items()}
    for group in release.values():
        if isinstance(group,dict) and isinstance(group.get('files'),dict):
            for n in group['files']:
                if n in hashes:group['files'][n]=hashes[n]
    release['publicRefine']={'version':'portfolio-refine-20260922-v1','files':{**css_hash,'portfolio-assets/market-refine-v1.js':hashes['portfolio-assets/market-refine-v1.js']},'note':'Reviewed blue-white homepage carried onto db4c7e3; compact phone composition, editorial copy and visibility pause. Original runtime inputs, tapes, sources and results retained.'}
    updates['release.json']=json.dumps(release,indent=2,ensure_ascii=False)+'\n'
    changed=[n for n,t in updates.items() if not (root/n).exists() or (root/n).read_text()!=t]
    if check and changed:raise SystemExit('Refinement regeneration required: '+', '.join(changed))
    if not check:
        for n in changed:(root/n).write_text(updates[n],encoding='utf-8',newline='')
    print('Portfolio refinements: '+(', '.join(changed) or 'already current'))
    return changed

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--check',action='store_true')
    a=p.parse_args();apply(a.root,a.check)
