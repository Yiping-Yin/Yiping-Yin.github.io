"""Real Chromium layouts and existing homepage interactions; produces before/after captures."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import base64
import json
import textwrap
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa/visual'
BASELINE = os.environ.get('BLUE_WHITE_BASELINE') == '1'
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def contrast(a, b):
    def lum(s):
        values = [int(x.strip()) / 255 for x in s[s.index('(')+1:s.index(')')].split(',')[:3]]
        values = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values]
        return sum(x*w for x, w in zip(values, (.2126,.7152,.0722)))
    x,y=sorted((lum(a),lum(b)))
    return (y+.05)/(x+.05)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    report = []
    try:
        with sync_playwright() as p:
            options = {'executable_path': os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}
            browser = p.chromium.launch(**options)
            for label, width, height in [('desktop',1440,960),('laptop',1280,800),('tablet',768,1024),('mobile',390,844),('small',320,700),('landscape',844,390)]:
                for theme in ('light','dark'):
                    context = browser.new_context(viewport={'width':width,'height':height}, color_scheme=theme, reduced_motion='reduce')
                    page = context.new_page()
                    errors=[]
                    page.on('pageerror',lambda error: errors.append(str(error)))
                    page.goto(url,wait_until='networkidle')
                    expect(page.locator('.th-chart svg').first).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (label, theme, 'horizontal overflow')
                    if not BASELINE:
                        expect(page.locator('#home-identity')).to_be_visible()
                        expect(page.locator('.home-actions a')).to_have_count(2)
                        intro = page.locator('.home-intro').bounding_box()
                        hero = page.locator('.terminal-hero').bounding_box()
                        assert intro['y'] + intro['height'] <= hero['y'] + 1
                        assert hero['height'] >= 300 and hero['width'] <= width
                        assert page.locator('.terminal-hero').evaluate('(e)=>getComputedStyle(e).backgroundColor') == 'rgb(4, 22, 36)'
                        for selector in ('.home-intro', '.home-primary', '.demo-featured-runs'):
                            pair = page.locator(selector).evaluate('(e)=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor]}')
                            if pair[1] != 'rgba(0, 0, 0, 0)':
                                assert contrast(*pair) >= 4.5, (label, theme, selector, pair)
                        for link in page.locator('.home-actions a').all():
                            assert link.bounding_box()['height'] >= 44
                        assert page.locator('.home-intro').evaluate('(e)=>getComputedStyle(e).backgroundColor') != 'rgb(4, 22, 36)'
                    prefix = 'before' if BASELINE else 'after'
                    if label in ('desktop','mobile'):
                        page.screenshot(path=str(OUT / f'{prefix}-{label}-{theme}.png'),full_page=True)
                        image = page.screenshot(path=str(OUT / f'{prefix}-{label}-{theme}-fold.jpg'),type='jpeg',quality=75)
                        if theme == 'light':
                            thumb = page.evaluate('''async (data) => {
                              const image = new Image(); image.src = 'data:image/jpeg;base64,' + data; await image.decode();
                              const canvas = document.createElement('canvas');
                              canvas.width = Math.min(800, image.width); canvas.height = Math.round(image.height * canvas.width / image.width);
                              canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                              return canvas.toDataURL('image/jpeg', .6).split(',')[1];
                            }''', base64.b64encode(image).decode())
                            (OUT / f'{prefix}-{label}-thumb.b64').write_text('\n'.join(textwrap.wrap(thumb, 100))+'\n')
                    if not BASELINE:
                        page.get_by_role('tab',name='MSFT',exact=True).click()
                        expect(page.locator('#th-panel')).to_have_attribute('aria-labelledby','th-tab-2')
                        page.get_by_role('tab',name='AAPL',exact=True).click()
                        expect(page.locator('#th-panel')).to_have_attribute('aria-labelledby','th-tab-1')
                        archive = page.locator('#published-runs')
                        archive.locator('summary').click()
                        expect(archive).to_have_attribute('open','')
                        archive.locator('summary').click()
                        assert archive.get_attribute('open') is None
                    assert not errors, errors
                    report.append({'viewport':label,'theme':theme,'errors':errors,'passed':True})
                    context.close()
            if not BASELINE:
                context = browser.new_context(viewport={'width':390,'height':844},java_script_enabled=False,color_scheme='light')
                page = context.new_page(); page.goto(url)
                expect(page.locator('#home-identity')).to_be_visible()
                expect(page.locator('.th-chart svg').first).to_be_visible()
                page.locator('.home-secondary').click()
                assert page.url.endswith('/profile.html')
                context.close()
                context = browser.new_context(viewport={'width':1280,'height':800},color_scheme='light')
                page=context.new_page(); page.goto(url)
                page.keyboard.press('Tab')
                expect(page.locator('.skip-link')).to_be_focused()
                page.locator('.home-primary').focus()
                assert page.locator('.home-primary').evaluate('(e)=>getComputedStyle(e).outlineStyle') != 'none'
                page.keyboard.press('Enter'); page.wait_for_url('**/training.html?market=historical#/training')
                assert page.url.endswith('/training.html?market=historical#/training')
                context.close()
            browser.close()
    finally:
        server.shutdown()
    (OUT / ('baseline.json' if BASELINE else 'results.json')).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'baseline':BASELINE,'layout_cases':len(report),'passed':True}))

if __name__ == '__main__':
    main()
