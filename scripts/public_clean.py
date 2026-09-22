"""Presentation cleanup on the existing design. No market or trading changes.

Called by the existing demo/quality generators. Retained source bundles and
records stay untouched; transforms validate exact source structures.
"""
import json
import re

MARK = '<!-- public-clean:v1 -->'
STYLE = '<link rel="stylesheet" href="/portfolio-assets/clean.css?v=clean-1">'
PAGES = ('index.html', 'profile.html', 'lab.html', 'training.html')


def replace(text, old, new, count=1):
    if text.count(old) != count:
        raise ValueError('Cleanup source structure changed: ' + old[:100])
    return text.replace(old, new)


def between(text, start, end, replacement):
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError('Cleanup component boundary changed: ' + start)
    a, b = text.index(start), text.index(end)
    if b <= a:
        raise ValueError('Cleanup component order changed')
    return text[:a] + replacement + text[b:]


def training(source):
    source = replace(source, ',u.jsx("p",{className:"d-say",children:u.jsx("span",{children:Dy(d)})})', '')
    source = between(source, 'function Zm({dataset:a,phone:o=!1})', 'const Mt=a=>', 'function Zm(){return null}')
    source = replace(source, 'scope:"col",children:"#"', 'scope:"col",children:"No."')
    # Make room for the explicit label without crowding the Strategy header.
    return replace(source, 'u.jsx("col",{style:{width:"26px"}}),u.jsx("col",{})',
                   'u.jsx("col",{style:{width:"40px"}}),u.jsx("col",{})')


def review(source):
    source = between(source, 'function Ce({dataset:s,result:n,mode:r="on_bar",instruments:t=[]})',
                     'const Ee=s=>', 'function Ce(){return null}')
    source = between(source, 'e.jsxs("section",{className:"rr-truth",children:',
                     'e.jsxs("footer",{className:"rr-foot",children:', '')
    return replace(source, 'e.jsx("th",{children:"#"})', 'e.jsx("th",{scope:"col",children:"No."})')


def studio(source):
    return replace(source, 'e.jsx("p",{"data-disclosure":!0,"data-copy-register":"BOTH",children:A}),', '')


def page(name, text):
    if name not in PAGES:
        return text
    if MARK not in text:
        text, count = re.subn(r'<details class="copy-details"[^>]*>.*?</details>', '', text, flags=re.S)
        if count != 1:
            raise ValueError('Expected one redundant static disclosure: ' + name)
        if name == 'index.html':
            for kind in ('wide', 'narrow'):
                text = replace(text, '<p class="th-say th-say-'+kind+'">Historical prices · Simulated trading</p>', '')
            text = replace(text, '<p data-disclosure data-copy-register="BOTH">Historical and synthetic prices · Simulated trading</p>', '')
            text, count = re.subn(r'<div class="s1-foot">\s*</div>', '', text)
            if count != 1:
                raise ValueError('Homepage disclosure wrapper is not empty')
        elif name == 'profile.html':
            text = replace(text, '<p>Historical and synthetic prices · Simulated trading</p>', '')
        elif name == 'lab.html':
            text = replace(text, '<p class="lab-say">Published simulations · Historical and synthetic prices</p>', '')
            text, count = re.subn(r'(<th\b[^>]*>)#(</th>)', r'\1No.\2', text)
            if count != 3:
                raise ValueError('Lab index headers changed')
        elif name == 'training.html':
            text = replace(text, '<footer class="pt-desk copy-site-notes" aria-label="Simulation information"></footer>', '')
            text = replace(text, 'project pages and simulation details remain available below:', 'project pages remain available below:')
        text = replace(text, '</head>', MARK+'\n'+STYLE+'\n</head>')
        text, count = re.subn(r'<body(?=[\s>])', '<body data-clean="v1"', text, count=1)
        if count != 1:
            raise ValueError('Missing page body: '+name)
    if name == 'training.html':
        match = re.search(r'<script type="importmap">(.*?)</script>', text)
        if not match:
            raise ValueError('Missing shared runtime import map')
        imports = json.loads(match[1])
        for module, aliases in (
            ('training-quality-v1.js', ('training-copy-v1.js','training-demo-v1.js','training-quality-v1.js')),
            ('review-quality-v1.js', ('review-copy-v1.js','review-quality-v1.js')),
            ('studio-demo-v1.js', ('studio-copy-v1.js','studio-details-v1.js','studio-demo-v1.js')),
        ):
            for alias in aliases:
                imports['imports']['/portfolio-assets/'+alias] = '/portfolio-assets/'+module+'?v=clean-1'
        text = text[:match.start(1)] + json.dumps(imports, separators=(',', ':')) + text[match.end(1):]
        text = text.replace('crossorigin src="/portfolio-assets/training-quality-v1.js"',
                            'crossorigin src="/portfolio-assets/training-quality-v1.js?v=clean-1"')
    return text
