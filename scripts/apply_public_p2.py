"""Fail-closed, idempotent public post-export P2 integration. Run after P1."""
import argparse,hashlib,json,re
from html import escape
from pathlib import Path
from public_p2_pages import pages
ROOT=Path(__file__).resolve().parents[1]
MARK='<!-- public-p2:v1 -->'
BASE='e56b1d175045a0d2bd6551fbc48056b1456f9651'
CASE='<a class="p2-case-entry" href="/research-algothon.html">Read the research case →</a>'
COMPARE='<a class="p2-case-entry" href="/compare.html">Compare published strategies →</a>'
def once(text,old,new):
    if text.count(old)!=1:raise ValueError('Public P2 source structure changed: '+old[:100])
    return text.replace(old,new,1)
def subonce(pattern,repl,text):
    result,n=re.subn(pattern,repl,text,count=0,flags=re.S)
    if n!=1:raise ValueError('Expected one source region: '+pattern[:90])
    return result

def run_map(root):
    runs={}
    for kind in ['historical','synthetic']:
        payload=json.loads((root/f'data/published-runs-{kind}.json').read_text())
        for r in payload['markets'][kind]['runs']:runs[r['result']['runId']]=r
    if len(runs)!=15:raise ValueError('Published set changed; review before generating P2 links.')
    return runs

def transform(name,text,runs):
    if MARK in text:return text
    if '<!-- public-p1:v1 -->' not in text:raise ValueError('Apply P1 before P2.')
    text=once(text,'</head>',MARK+'\n<link rel="stylesheet" href="/portfolio-assets/p2.css?v=p2-1">\n</head>')
    if name=='index.html':
        hero_match=re.search(r'<script\b[^>]*id="terminal-hero-data"[^>]*>(.*?)</script>',text,re.S)
        if not hero_match:raise ValueError('Missing terminal payload.')
        hero=json.loads(hero_match[1]);mapping={'defaultSymbol':hero['defaultSymbol'],'runs':{}}
        for instrument in hero['instruments']:
            r=runs[instrument['run']['runId']]
            if r['marketKind']!='historical' or r['symbol']!=instrument['symbol']:raise ValueError('Hero run identity mismatch.')
            mapping['runs'][r['symbol']]={'runId':r['result']['runId'],'taskId':r['taskId'],'title':r['title'],'netPnl':r['result']['metrics']['netPnl'],'fillCount':r['result']['metrics']['fillCount']}
        r=mapping['runs'][mapping['defaultSymbol']];id=r['runId'];base='/training.html?market=historical'
        current=f'''\n<aside class="p2-current-run" id="current-run" aria-label="Evidence for the terminal run"><div><p class="p2-kicker">Now in the terminal · historical replay</p><p><strong id="p2-current-label">{escape(mapping['defaultSymbol'])} · {escape(r['title'])} · completed run {id[:8]}</strong></p></div><nav class="p2-actions" aria-label="Open the terminal run"><a id="p2-current-report" href="{base}#/market?view=review&amp;run={id}">Report</a><a id="p2-current-replay" href="{base}#/market?view=replay&amp;run={id}">Replay</a><a id="p2-current-source" href="{base}#/studio?source={r['taskId']}">Source</a><a id="p2-current-compare" href="/compare.html?a={id}">Compare</a></nav></aside>\n'''
        text=subonce(r'(<section\b[^>]*id="about"[^>]*>.*?</section>)',lambda m:m[0]+current,text)
        def matrix(m):
            def link(a):
                rid=a[2]
                if rid not in runs:raise ValueError('Unknown matrix run.')
                rr=runs[rid];label=f"Replay {rr['title']} · {rr['symbol']} · {rr['marketKind']}"
                return '<a'+a[1]+f' data-p2-run="{rid}" aria-label="{escape(label,quote=True)}">'
            body,n=re.subn(r'<a\b([^>]*?href="[^"]*run=([0-9a-f]{64})"[^>]*)>',link,m[2])
            if n!=30:raise ValueError(f'Expected 30 desktop/mobile run links, found {n}.')
            body=re.sub(r'<span\b[^>]*class="s1-here"[^>]*>.*?</span>','',body,flags=re.S)
            body=once(body,'<p class="s1-legend">',f'<div class="p2-home-actions"><a id="p2-table-compare" href="/compare.html?a={id}">Compare two published runs →</a><span class="p2-note">Select a result to open its replay; the replay leads to its source.</span></div>\n<p class="s1-legend">')
            return m[1]+body+m[3]
        text=subonce(r'(<div\b[^>]*id="published-runs"[^>]*>)(.*?)(</div>)',matrix,text)
        text=subonce(r'(<li\b[^>]*id="lab-archive-algothon"[^>]*>.*?</li>)',lambda m:m[0]+'\n<li class="p2-case-entry">'+CASE+'</li>',text)
        data=json.dumps(mapping,separators=(',',':')).replace('<','\\u003c')
        text=once(text,'</body>',f'<script id="p2-run-map" type="application/json">{data}</script>\n<script type="module" src="/portfolio-assets/home-runs.mjs?v=p2-1"></script>\n</body>')
    elif name=='profile.html':
        for slug,link in [('algothon',CASE),('pbook',COMPARE)]:
            marker=f'<a class="p1-project-link" href="#project-{slug}">'
            text=once(text,marker,link+'\n'+marker)
    elif name=='lab.html':
        text=subonce(r'(<tr\b[^>]*id="archive-algothon"[^>]*>.*?</tr>)',lambda m:m[0]+'\n<tr class="p2-case-entry"><td colspan="3">'+CASE+'</td></tr>',text)
        text=once(text,'href="/#published-runs">All 15 published runs</a>', 'href="/#published-runs">All 15 published runs</a> '+COMPARE)
    return text

def apply(root=ROOT,check=False):
    root=Path(root);runs=run_map(root)
    updates={n:transform(n,(root/n).read_text(encoding='utf-8'),runs) for n in ['index.html','profile.html','lab.html']}
    updates.update(pages())
    sitemap=(root/'sitemap.xml').read_text()
    for n in pages():
        url='https://yiping-yin.github.io/'+n
        if url not in sitemap:sitemap=once(sitemap,'</urlset>',f'  <url><loc>{url}</loc></url>\n</urlset>')
    updates['sitemap.xml']=sitemap
    release=json.loads((root/'release.json').read_text())
    hashes={n:hashlib.sha256(t.encode('utf-8')).hexdigest() for n,t in updates.items()}
    for name in ['portfolio-assets/comparison-model.mjs','portfolio-assets/comparison-page.mjs','portfolio-assets/home-runs.mjs','portfolio-assets/p2.css']:
        hashes[name]=hashlib.sha256((root/name).read_bytes()).hexdigest()
    # Keep P1 independently reproducible and preserve original engine/tape provenance.
    for n in ['index.html','profile.html','lab.html']:release['publicEnhancements']['files'][n]=hashes[n]
    release['publicP2']={'version':'p2-20260921-v1','baseCommit':BASE,'scope':['P2-01','P2-02','P2-03'],'files':hashes,'note':'Read-only public evidence views. Engine, tapes, submitted sources and published runs are unchanged.'}
    updates['release.json']=json.dumps(release,indent=2,ensure_ascii=False)+'\n'
    changed=[n for n,t in updates.items() if not (root/n).exists() or (root/n).read_text(encoding='utf-8')!=t]
    if check:
        if changed:raise SystemExit('Public P2 output needs regeneration: '+', '.join(changed))
    else:
        for n in changed:(root/n).write_text(updates[n],encoding='utf-8',newline='')
    print('Public P2: '+(', '.join(changed) if changed else 'already current'))
    return changed
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--root',type=Path,default=ROOT);a=p.parse_args();apply(a.root,a.check)
