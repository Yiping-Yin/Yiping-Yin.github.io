"""Real Chromium acceptance; run on a machine that permits local HTTP navigation."""
import functools
import http.server
import json
import os
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa'
RUN = '3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'
PROJECTS = ['algothon','market-making','etf-pricing','pbook','explaining-markets','signal-mosaic','financial-agents','agent-society','latent-agent','pittsai']

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class BrowserAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        options = {'headless':True}
        if os.environ.get('CHROMIUM_EXECUTABLE'): options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        cls.browser = cls.pw.chromium.launch(**options)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
        self.page = self.context.new_page();self.page.set_default_timeout(10000)
        self.errors = [];self.posts=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('request',lambda r:self.posts.append(r.url) if r.method!='GET' else None)
    def tearDown(self):
        if not self.page.is_closed():
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')),full_page=True)
        self.context.close()
        self.assertEqual(self.errors,[], 'Browser JavaScript errors')
        self.assertEqual(self.posts,[], 'Public P1 must not execute strategies or submit API writes')
    def goto(self,path):
        before = self.page.url
        r = self.page.goto(self.base+path,wait_until='networkidle')
        if r is None:
            # Native fragment navigation has no HTTP response.
            self.assertEqual(before.split('#')[0],(self.base+path).split('#')[0])
        else:
            self.assertEqual(r.status,200)
        self.assertEqual(self.page.url,self.base+path)
    def studio(self):
        self.goto('/training.html#/studio')
        self.page.locator('[data-p1-source-export]').wait_for()
    def download(self, keyboard=False):
        source=self.page.locator('textarea[aria-label="Edit Python strategy source"]').input_value()
        label=self.page.locator('#ev-panel').get_attribute('aria-labelledby').removeprefix('ev-tab-')
        button=self.page.get_by_role('button',name='Download .py',exact=True)
        before=self.page.evaluate('JSON.stringify({...localStorage})')
        with self.page.expect_download() as event:
            if keyboard:button.focus();self.page.keyboard.press('Enter')
            else:button.click()
        d=event.value
        self.assertEqual(Path(d.path()).read_bytes(),source.encode('utf-8'))
        self.assertEqual(d.suggested_filename,'pbook-'+label+'.py')
        self.assertEqual(before,self.page.evaluate('JSON.stringify({...localStorage})'))
        self.assertEqual(self.page.locator('[data-p1-source-export]').count(),1)
        return source
    def test_public_links_work_without_javascript(self):
        self.context.close();self.context=self.browser.new_context(java_script_enabled=False)
        self.page=self.context.new_page()
        for path,selector in [('/','#lab-archive-algothon'),('/lab.html','#archive-algothon')]:
            self.goto(path);row=self.page.locator(selector)
            self.assertEqual(row.locator('a').count(),2)
            self.assertTrue(row.get_by_role('link',name='Research report · PDF').is_visible())
            self.assertTrue(row.get_by_role('link',name='Code and materials').is_visible())
    def test_profile_fragments_open_every_collapsed_project(self):
        for slug in PROJECTS:
            self.goto('/profile.html#project-'+slug)
            item=self.page.locator('#project-'+slug)
            self.assertTrue(item.is_visible())
            if slug!='algothon':
                self.page.wait_for_function('(id) => document.getElementById(id).open',arg='project-'+slug)
                self.assertIsNotNone(item.get_attribute('open'))
            self.page.wait_for_timeout(80)
            top=item.bounding_box()['y'];self.assertGreaterEqual(top,-2);self.assertLess(top,260)
    def test_profile_report_back_forward_retains_historical_context(self):
        self.goto('/profile.html#project-pbook')
        self.page.get_by_role('link',name='AAPL trend report',exact=True).click();self.page.wait_for_load_state('networkidle')
        self.assertIn('market=historical#/market?view=review&run='+RUN,self.page.url)
        # Network idle can precede the selected report's React render.
        expect(self.page.locator('body')).to_contain_text('AAPL',timeout=10000)
        self.page.go_back(wait_until='networkidle')
        self.assertIn('#project-pbook',self.page.url)
        self.assertIsNotNone(self.page.locator('#project-pbook').get_attribute('open'))
        self.page.go_forward(wait_until='networkidle')
        self.assertIn('view=review&run='+RUN,self.page.url)
        expect(self.page.locator('body')).to_contain_text('AAPL',timeout=10000)
    def test_published_runs_anchor(self):
        self.goto('/lab.html')
        self.page.get_by_role('link',name='All 15 published runs',exact=True).click();self.page.wait_for_load_state('networkidle')
        self.assertTrue(self.page.url.endswith('/#published-runs'))
        self.assertTrue(self.page.locator('#published-runs').is_visible())
    def test_download_all_four_published_strategies(self):
        self.studio();tabs=self.page.locator('.ev-tabs [role="tab"]');self.assertEqual(tabs.count(),4)
        for i in range(tabs.count()):
            tabs.nth(i).click();self.download()
    def test_download_edited_utf8_draft_and_after_reload(self):
        self.studio()  # This public editor is editable directly; there is no Edit button.
        source='# 中文 π\n\ndef on_bar(history, account, state):\n    return None\n'
        self.page.locator('textarea[aria-label="Edit Python strategy source"]').fill(source)
        self.assertEqual(self.download(),source)
        self.page.reload(wait_until='networkidle');self.page.locator('[data-p1-source-export]').wait_for()
        self.assertEqual(self.download(),source)
    def test_empty_draft_is_not_replaced_by_published_source(self):
        self.studio()  # This public editor is editable directly; there is no Edit button.
        self.page.locator('textarea[aria-label="Edit Python strategy source"]').fill('')
        self.assertEqual(self.download(),'')
    def test_keyboard_download(self):
        self.studio();self.download(keyboard=True)
    def test_failed_download_keeps_editor_content(self):
        self.studio();editor=self.page.locator('textarea[aria-label="Edit Python strategy source"]');before=editor.input_value()
        self.page.evaluate("() => { URL.createObjectURL=()=>{throw new Error('Download blocked in acceptance test')}; }")
        self.page.get_by_role('button',name='Download .py',exact=True).click()
        status=self.page.locator('.p1-export-status');self.assertIn('Download could not start',status.inner_text())
        self.assertEqual(status.get_attribute('data-error'),'true');self.assertEqual(editor.input_value(),before)
    def test_source_controls_do_not_duplicate_after_route_changes(self):
        self.studio()
        for _ in range(3):
            self.page.evaluate("location.hash='/market'");self.page.wait_for_timeout(150)
            self.page.evaluate("location.hash='/studio'");self.page.locator('[data-p1-source-export]').wait_for()
            self.assertEqual(self.page.locator('[data-p1-source-export]').count(),1)
        self.download()
    def test_desktop_short_window_and_phone(self):
        for width,height in [(1440,900),(1440,600),(390,844)]:
            self.page.set_viewport_size({'width':width,'height':height})
            for path in ['/','/profile.html#project-pbook','/lab.html#archive-algothon','/training.html#/studio']:
                self.goto(path)
                if '#/studio' in path:
                    self.page.locator('[data-p1-source-export]').wait_for()
                    box=self.page.get_by_role('button',name='Download .py',exact=True).bounding_box()
                    self.assertGreaterEqual(box['height'],44)
                self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), f'{path} at {width}x{height}')
                self.page.screenshot(path=str(OUT/(f'viewport-{width}-{height}-'+path.split('#')[0].replace('/','').replace('.html','')+'.png')),full_page=True)

if __name__=='__main__':unittest.main(verbosity=2)
