"""Four approved refinements; real Chromium, including native tab visibility.
Run native visibility coverage with: xvfb-run -a python tests/refine_browser.py
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('REFINE_EVIDENCE', str(ROOT / 'qa/refine')))
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class RefineBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True, exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Handler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=not bool(os.environ.get('DISPLAY')))
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
        self.page=self.context.new_page();self.errors=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
    def tearDown(self):
        self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')),full_page=True)
        self.context.close();self.assertEqual(self.errors,[])
    def home(self):
        self.page.goto(self.base+'/',wait_until='networkidle')
    def replay(self,task='hold',kind='historical',minute=40):
        pack=json.loads((ROOT/f'data/published-runs-{kind}.json').read_text())
        run=next(r for r in pack['markets'][kind]['runs'] if r['taskId']==task)
        r=run['result']
        self.page.goto(self.base+f'/training.html?market={kind}#/market?view=replay&run={r["runId"]}&tape={r["datasetChecksum"]}&minute={minute}',wait_until='networkidle')
        expect(self.page.locator('input.tm-scrubber')).to_have_value(str(minute-1))
    def test_identity_and_native_entries(self):
        self.home()
        heading=self.page.get_by_role('heading',level=1)
        self.assertNotIn('sr-only',heading.get_attribute('class') or '')
        self.assertGreater(heading.bounding_box()['height'],30)
        self.assertIn('Yiping Yin',heading.inner_text())
        expect(self.page.get_by_role('link',name='Explore P.Book')).to_have_attribute('href','/training.html?market=historical#/training')
        expect(self.page.get_by_role('link',name='View Profile')).to_have_attribute('href','/profile.html')
    def test_phone_composition_has_chart_priority_and_replay_identity(self):
        self.home()
        self.assertLessEqual(self.page.locator('.terminal-hero').bounding_box()['height'],530)
        self.assertGreaterEqual(self.page.locator('.th-chart').bounding_box()['height'],170)
        self.assertLessEqual(self.page.locator('.th-ladder tbody tr:visible').count(),4)
        self.assertGreaterEqual(self.page.locator('.th-ladder tbody tr:visible').count(),2)
        expect(self.page.locator('.th-replay-tag')).to_be_visible()
        link=self.page.locator('.th-footer a')
        self.assertIn('Open full demo',link.inner_text())
        self.assertGreaterEqual(link.bounding_box()['height'],44)
        hero=self.page.locator('.terminal-hero').bounding_box();box=link.bounding_box()
        self.assertLessEqual(box['y']+box['height'],hero['y']+hero['height'])
    def test_editorial_copy_has_one_comparison_and_clear_actions(self):
        self.home()
        cards=self.page.locator('.demo-featured-runs article')
        for i in range(3):
            card=cards.nth(i)
            for label in ('Watch replay','View source','Read report'):
                expect(card.get_by_role('link',name=label,exact=True)).to_be_visible()
        self.assertNotIn('1 fills',' '.join(cards.all_inner_texts()))
        self.assertIn('1 fill',cards.nth(1).inner_text())
        self.page.goto(self.base+'/profile.html',wait_until='networkidle')
        project=self.page.locator('#project-algothon')
        self.assertEqual(project.inner_text().count('3.7 points'),1)
        self.assertEqual(project.inner_text().count('0.4 of one block'),1)
        expect(project.locator('.evaluation-comparisons')).to_contain_text('behind second place')
        expect(project.locator('.research-details summary')).to_be_visible()
    def test_native_background_pause_and_explicit_resume(self):
        if not os.environ.get('DISPLAY'):
            self.skipTest('Native tab visibility requires headed Chromium; use xvfb-run')
        self.replay()
        play=self.page.get_by_role('button',name='Play replay',exact=True)
        play.click()
        self.page.wait_for_function('Number(document.querySelector("input.tm-scrubber").value)>39')
        other=self.context.new_page();other.goto('about:blank');other.bring_to_front()
        self.page.wait_for_function('document.hidden===true')
        self.page.wait_for_timeout(400)
        cursor=self.page.locator('input.tm-scrubber').input_value()
        self.page.wait_for_timeout(900)
        self.assertEqual(self.page.locator('input.tm-scrubber').input_value(),cursor)
        self.page.bring_to_front();self.page.wait_for_function('document.hidden===false')
        expect(play).to_be_visible()
        self.page.wait_for_timeout(500)
        expect(self.page.locator('input.tm-scrubber')).to_have_value(cursor)
        play.click()
        self.page.wait_for_function('(v)=>Number(document.querySelector("input.tm-scrubber").value)>Number(v)',arg=cursor)
        self.page.get_by_role('button',name='Pause replay',exact=True).click()
        other.close()
    def test_layout_matrix_and_no_script(self):
        for w,h in ((320,568),(390,844),(700,800),(800,900),(1000,800),(1440,900)):
            for theme in ('light','dark'):
                self.page.set_viewport_size({'width':w,'height':h});self.page.emulate_media(color_scheme=theme)
                self.home()
                self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(w,theme))
                self.assertGreater(self.page.locator('.th-chart').bounding_box()['height'],100)
                self.page.screenshot(path=str(OUT/f'home-{w}-{theme}.png'),full_page=True)
        ctx=self.browser.new_context(java_script_enabled=False,viewport={'width':320,'height':740})
        page=ctx.new_page();page.goto(self.base+'/')
        expect(page.get_by_role('link',name='View Profile')).to_be_visible()
        self.assertFalse(page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
        expect(page.locator('.th-replay-tag')).to_be_visible()
        page.screenshot(path=str(OUT/'home-no-js.png'),full_page=True);ctx.close()

if __name__=='__main__':
    if os.environ.get('REFINE_BASELINE'):
        names=['test_identity_and_native_entries','test_phone_composition_has_chart_priority_and_replay_identity','test_editorial_copy_has_one_comparison_and_clear_actions','test_native_background_pause_and_explicit_resume']
        suite=unittest.TestSuite(RefineBrowser(n) for n in names)
        result=unittest.TextTestRunner(verbosity=2).run(suite)
        raise SystemExit(0 if len(result.failures)==4 and not result.errors and not result.skipped else 1)
    unittest.main(verbosity=2)
