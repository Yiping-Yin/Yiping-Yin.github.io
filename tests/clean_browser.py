"""Clean existing presentation; exercise actual pages in Chromium."""
import functools
import http.server
import json
import os
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('CLEAN_EVIDENCE', str(ROOT/'qa/clean')))
RUN = '3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'
PATHS = ('/', '/profile.html#project-pbook', '/lab.html',
         '/training.html?market=historical#/training',
         '/training.html?market=historical#/market',
         '/training.html?market=historical#/market?view=review&run='+RUN,
         '/training.html?market=historical#/market?view=replay&run='+RUN,
         '/training.html?market=historical#/studio')
REMOVED = ('.copy-details', '.copy-site-notes', '.th-say', '.s1-foot', '.d-say',
           '.d-say-phone', '.data-disclosure', '.rr-truth')
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
class CleanBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True, exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Handler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        options = {'headless':True}
        if os.environ.get('CHROMIUM_EXECUTABLE'): options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        cls.browser = cls.pw.chromium.launch(**options)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1440,'height':900}, reduced_motion='reduce')
        self.page = self.context.new_page(); self.page.set_default_timeout(10000)
        self.errors = []; self.writes = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('request', lambda r: self.writes.append(r.url) if r.method!='GET' else None)
    def tearDown(self):
        try:
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')),full_page=True)
        finally:
            self.context.close()
        self.assertEqual(self.errors,[]); self.assertEqual(self.writes,[])
    def goto(self,path):
        response=self.page.goto(self.base+path,wait_until='networkidle')
        if response:self.assertEqual(response.status,200)
    def assert_clean(self):
        expect(self.page.locator(','.join(REMOVED))).to_have_count(0)
        text=self.page.locator('body').inner_text()
        for phrase in ('Data & simulation details', 'Historical prices · Simulated trading',
                       'Synthetic prices · Simulated trading', 'For learning and research, not investment advice.'):
            self.assertNotIn(phrase,text)
        self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth+1'))
        self.assertEqual(self.page.locator('.blue-white-home,.home-intro').count(),0)
    def test_explanations_removed_in_all_public_views(self):
        for path in PATHS:
            with self.subTest(path=path):
                self.goto(path); self.assert_clean()
        for path in ('#/training','#/market','#/market?view=review','#/studio'):
            self.goto('/training.html?market=synthetic'+path); self.assert_clean()
    def test_hash_headers_become_explicit_spaced_labels(self):
        self.goto('/training.html?market=historical#/market')
        headings=self.page.locator('.d-r thead th')
        expect(headings.nth(0)).to_have_text('No.')
        expect(headings.nth(1)).to_have_text('Strategy')
        gap=self.page.locator('.d-r thead').evaluate('''n=>{
          const cells=n.querySelectorAll('th'),range=document.createRange();
          range.selectNodeContents(cells[0]);const a=range.getBoundingClientRect();
          range.selectNodeContents(cells[1]);const b=range.getBoundingClientRect();return b.left-a.right;
        }''')
        self.assertGreaterEqual(gap,8)
        self.assertNotIn('#',self.page.locator('.d-r thead').inner_text())
        self.page.locator('.d-r').screenshot(path=str(OUT/'strategy-table.png'))
        (OUT/'table-spacing.json').write_text(json.dumps({'headerTextGap':gap}))
        self.goto('/lab.html')
        for heading in self.page.locator('th').all():self.assertNotEqual(heading.inner_text().strip(),'#')
    def test_phone_desktop_and_theme_layouts_remain_clean(self):
        for width,height in ((320,740),(390,844),(1000,760),(1440,900)):
            for theme in ('light','dark'):
                self.page.set_viewport_size({'width':width,'height':height});self.page.emulate_media(color_scheme=theme)
                for name,path in (('home','/'),('overview',PATHS[3]),('trading',PATHS[4])):
                    self.goto(path);self.assert_clean()
                    if name=='home':
                        link=self.page.locator('.terminal-hero .th-footer a');expect(link).to_be_visible()
                        self.assertIn('view=replay&run='+RUN,link.get_attribute('href'))
                    self.page.screenshot(path=str(OUT/f'{name}-{width}-{theme}.png'),full_page=True)
    def test_native_links_and_editor_actions_survive(self):
        self.goto('/');link=self.page.locator('.terminal-hero .th-footer a')
        link.focus();self.page.keyboard.press('Enter');self.page.wait_for_load_state('networkidle')
        expect(self.page.locator('.quality-replay-share')).to_be_visible()
        self.goto('/training.html?market=historical#/studio')
        expect(self.page.get_by_role('button',name='Download .py',exact=True)).to_be_visible()
        expect(self.page.locator('.ev-trading')).to_be_visible()
        self.page.get_by_role('button',name='Edit',exact=True).click()
        expect(self.page.locator('textarea')).to_be_editable()
        expect(self.page.locator('.demo-source-note')).to_contain_text('this site does not execute Python.')
    def test_no_javascript_has_no_notes_or_empty_footer(self):
        self.context.close();self.context=self.browser.new_context(java_script_enabled=False)
        self.page=self.context.new_page()
        for path in ('/','/profile.html','/lab.html','/training.html'):
            self.goto(path);self.assert_clean()
        expect(self.page.locator('noscript h1')).to_contain_text('P.Book')
        self.assertEqual(self.page.locator('noscript a[href]').count(),3)
if __name__=='__main__':unittest.main(verbosity=2)
