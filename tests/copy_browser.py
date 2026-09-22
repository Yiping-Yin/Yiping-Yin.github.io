"""Chromium presentation-copy acceptance on a local candidate, without server writes."""
import functools
import http.server
import os
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa'/'copy'
RUN='3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

class CopyBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True,exist_ok=True)
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start(); opts={'headless':True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
        cls.browser=cls.pw.chromium.launch(**opts)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':900})
        self.page=self.context.new_page();self.page.set_default_timeout(12000)
        self.errors=[];self.writes=[];self.js=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('request',lambda r:self.writes.append(r.url) if r.method!='GET' else None)
        self.page.on('response',lambda r:self.js.append((r.url,r.status)) if r.url.split('?')[0].endswith('.js') else None)
    def tearDown(self):
        self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')),full_page=True)
        self.context.close();self.assertEqual(self.errors,[]);self.assertEqual(self.writes,[])
    def goto(self,path):
        response=self.page.goto(self.base+path,wait_until='networkidle')
        if response:self.assertEqual(response.status,200)
    def closed_notes(self):
        self.assertNotIn('No live market connection or real orders.',self.page.locator('body').inner_text())
        self.assertNotIn('Not live · Not advice',self.page.locator('body').inner_text())
    def test_overview_modes_omit_labels_but_keep_session_context(self):
        for kind in ['synthetic','historical']:
            self.goto('/training.html?market='+kind+'#/training')
            expect(self.page.locator('.d-overview .d-say')).to_have_count(0)
            expect(self.page.locator('.d-bar')).to_contain_text('390')
            self.closed_notes()
    def test_trading_has_no_repeated_labels_on_desktop_and_phone(self):
        for width,height in [(1440,600),(390,844)]:
            self.page.set_viewport_size({'width':width,'height':height})
            for kind in ['synthetic','historical']:
                self.goto('/training.html?market='+kind+'#/market')
                expect(self.page.locator('.d-say, .d-say-phone')).to_have_count(0)
                expect(self.page.locator('#root section.pt-desk')).to_be_visible()
                self.closed_notes()
                self.page.screenshot(path=str(OUT/f'trading-{kind}-{width}.png'),full_page=True)
    def test_training_removes_notes_without_an_empty_footer(self):
        self.goto('/training.html#/market')
        expect(self.page.locator('#root section.pt-desk')).to_be_visible()
        expect(self.page.locator('.copy-site-notes, #simulation-details, .d-say')).to_have_count(0)
        self.closed_notes()
    def test_profile_home_lab_keep_navigation_without_redundant_details(self):
        for path in ['/','/profile.html#project-pbook','/lab.html']:
            self.goto(path)
            expect(self.page.locator('details.copy-details')).to_have_count(0)
            self.assertGreater(self.page.locator('a[href*="training.html"]').count(), 0)
            self.closed_notes()
        expect(self.page.locator('#lab-publication-scope')).to_contain_text('Private')
    def test_report_replay_and_ide_load_new_copy_bundles(self):
        for route in ['#/market?view=review&run='+RUN,'#/market?view=replay&run='+RUN,'#/studio']:
            self.goto('/training.html?market=historical'+route)
            if route=='#/studio':
                expect(self.page.get_by_role('button',name='Download .py',exact=True)).to_be_visible()
                expect(self.page.locator('.ev-disclosure [data-copy-register]')).to_have_count(0)
                expect(self.page.locator('.ev-trading')).to_be_visible()
                expect(self.page.locator('.demo-source-note')).to_contain_text('this site does not execute Python.')
            else:expect(self.page.locator('body')).to_contain_text('AAPL')
            self.closed_notes()
        loaded={url.split('/')[-1].split('?')[0] for url,status in self.js if status==200}
        self.assertTrue({'training-demo-v1.js','review-copy-v1.js','market-copy-v1.js','studio-demo-v1.js'}<=loaded or {'training-quality-v1.js','review-quality-v1.js','market-quality-v1.js','studio-demo-v1.js'}<=loaded,loaded)
        self.assertFalse(any(n in loaded for n in ['training-CI29yBEs.js','ReviewPage-DYeWlPpm.js','MarketPage-3-BVK_gJ.js','studioRoute.static-Dtkr_XUq.js']))
    def test_notes_work_with_javascript_disabled(self):
        self.context.close();self.context=self.browser.new_context(java_script_enabled=False);self.page=self.context.new_page()
        self.goto('/training.html');expect(self.page.locator('noscript h1')).to_contain_text('P.Book')
        expect(self.page.locator('#simulation-details, .copy-site-notes')).to_have_count(0)
        self.assertGreater(self.page.locator('noscript a[href]').count(), 0)
    def test_responsive_pages_keep_primary_copy_and_no_overflow(self):
        for width,height in [(1440,600),(390,844),(320,740)]:
            self.page.set_viewport_size({'width':width,'height':height})
            for path in ['/','/profile.html#project-pbook','/lab.html','/training.html#/studio']:
                self.goto(path)
                if '#/studio' in path:expect(self.page.get_by_role('button',name='Download .py',exact=True)).to_be_visible()
                self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),f'{path}@{width}')
                self.page.screenshot(path=str(OUT/f'copy-{width}-{path.split("#")[0].replace("/","") or "home"}.png'),full_page=True)
        self.page.emulate_media(color_scheme='dark');self.goto('/training.html#/market')
        expect(self.page.locator('.d-say-phone')).to_have_count(0)
        expect(self.page.locator('#root section.pt-desk')).to_be_visible()

if __name__=='__main__':unittest.main(verbosity=2)
