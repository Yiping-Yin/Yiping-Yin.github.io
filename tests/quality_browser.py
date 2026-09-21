"""Actual browser journeys; baseline mode must reproduce exactly four failures."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import unittest
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('QUALITY_EVIDENCE', str(ROOT/'qa/quality')))
RUNS=[]
TIMEZONES={}
for kind in ('historical','synthetic'):
    market=json.loads((ROOT/f'data/published-runs-{kind}.json').read_text())['markets'][kind]
    RUNS.extend(market['runs']);TIMEZONES[kind]=market['timezone']
def pick(symbol='AAPL',task='hold'):
    return next(r for r in RUNS if r['symbol']==symbol and r['taskId']==task)
def route(run,view='replay',minute=None):
    r=run['result']
    path=f"/training.html?market={run['marketKind']}#/market?view={view}&run={r['runId']}"
    return path if minute is None else path+f"&tape={r['datasetChecksum']}&minute={minute}"
def expected_drawdown(run):
    r=run['result'];values=[round(row[0]*100) for row in r['equity']]
    high=round(r['config']['initialCash']*100);peak=0;loss=0;denominator=high;best=None
    for i,value in enumerate(values):
        if value>high:high=value;peak=i
        if (high-value)*denominator>loss*high:
            loss=high-value;denominator=high;best=(peak,i)
    return best
def clock(run,index):
    # Transport time is bar availability; existing report labels use interval start.
    return datetime.fromtimestamp((run['result']['barStart']+(index-1)*60000)/1000,ZoneInfo(TIMEZONES[run['marketKind']])).strftime('%H:%M')
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
class QualityBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True,exist_ok=True)
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(headless=True)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':900})
        self.page=self.context.new_page();self.errors=[];self.writes=[]
        self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        self.page.on('request',lambda req:self.writes.append(req.url) if req.method!='GET' else None)
    def tearDown(self):
        self.capture(self._testMethodName+'.png')
        self.context.close();self.assertEqual(self.errors,[]);self.assertEqual(self.writes,[])
    def open(self,path):
        self.page.goto('about:blank');self.page.goto(self.base+path,wait_until='networkidle')
    def capture(self,name):
        self.page.evaluate("window.scrollTo({top:0,left:0,behavior:'instant'})")
        self.page.screenshot(path=str(OUT/name),full_page=True)
    def no_page_overflow(self):
        self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
    def test_general_navigation_is_historical(self):
        for path in ('/lab.html','/profile.html','/compare.html','/research-algothon.html','/404.html'):
            self.open(path)
            for href in self.page.locator('a[href*="training.html"]').evaluate_all('xs=>xs.map(x=>x.getAttribute("href"))'):
                parsed=urlsplit(href)
                if parsed.fragment in ('/market','/training','/studio'):
                    self.assertEqual(parse_qs(parsed.query).get('market'),['historical'],(path,href))
    def test_report_uses_the_correct_drawdown_interval(self):
        run=pick();self.open(route(run,'review'))
        peak,trough=expected_drawdown(run)
        note=self.page.locator('.rr-figures article').filter(has_text='Deepest drawdown').inner_text()
        self.assertIn(clock(run,trough),note)
        self.assertIn(clock(run,peak),note)
        marker=self.page.locator('[data-dd-peak]')
        expect(marker).to_have_attribute('data-dd-peak',str(peak))
        expect(marker).to_have_attribute('data-dd-trough',str(trough))
    def test_replay_has_a_share_control(self):
        self.open(route(pick()))
        self.assertEqual(self.page.get_by_role('button',name='Share this moment',exact=True).count(),1)
    def test_mobile_lab_body_is_readable(self):
        self.page.set_viewport_size({'width':390,'height':844});self.open('/lab.html')
        size=self.page.locator('.lab-ledger tbody th').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
        self.assertGreaterEqual(size,14)
        self.no_page_overflow()
    def test_all_fifteen_reports_keep_the_recorded_values_and_correct_markers(self):
        audit=[]
        for run in RUNS:
            self.open(route(run,'review'));bounds=expected_drawdown(run)
            card=self.page.locator('.rr-figures article').filter(has_text='Deepest drawdown')
            expect(card.locator('strong')).to_have_text(f"{run['result']['metrics']['maxDrawdownPct']:.3f}%")
            marker=self.page.locator('[data-dd-peak]')
            if bounds:
                peak,trough=bounds
                expect(marker).to_have_attribute('data-dd-peak',str(peak));expect(marker).to_have_attribute('data-dd-trough',str(trough))
                note=self.page.locator('.rr-figures article').filter(has_text='Deepest drawdown').inner_text()
                self.assertIn(clock(run,trough),note)
                self.assertIn(clock(run,peak),note)
            else:
                expect(marker).to_have_count(0)
                expect(self.page.locator('.quality-dd-labels')).to_contain_text('No decline')
            self.assertFalse(any('IDE' in text for text in self.page.locator('button').all_text_contents()))
            audit.append({'run':run['result']['runId'],'symbol':run['symbol'],'task':run['taskId'],'interval':bounds,'publishedPct':run['result']['metrics']['maxDrawdownPct']})
        (OUT/'drawdown-audit.json').write_text(json.dumps(audit,indent=2))
    def test_shared_moment_opens_paused_in_a_fresh_context(self):
        run=pick();self.open(route(run,minute=148))
        slider=self.page.locator('input.tm-scrubber')
        expect(slider).to_have_value('147')
        self.page.get_by_role('button',name='Share this moment',exact=True).click()
        field=self.page.get_by_role('textbox',name='Public replay link',exact=True)
        expect(field).to_be_visible();shared=field.input_value()
        self.assertEqual(set(parse_qs(urlsplit(shared).fragment.split('?')[1])),{'view','run','tape','minute'})
        other=self.browser.new_context();page=other.new_page()
        try:
            page.goto(shared,wait_until='networkidle')
            expect(page.locator('input.tm-scrubber')).to_have_value('147')
            expect(page.get_by_role('button',name='Play replay',exact=True)).to_be_visible()
            self.assertEqual(page.get_by_role('button',name='Pause replay',exact=True).count(),0)
            page.reload(wait_until='networkidle');expect(page.locator('input.tm-scrubber')).to_have_value('147')
        finally:other.close()
    def test_clipboard_success_and_denial_both_keep_an_exact_link(self):
        self.context.grant_permissions(['clipboard-read','clipboard-write'])
        self.open(route(pick(),minute=148))
        self.page.get_by_role('button',name='Share this moment',exact=True).click()
        expect(self.page.locator('.quality-share-result [role="status"]')).to_contain_text('Link copied')
        shared=self.page.get_by_role('textbox',name='Public replay link',exact=True).input_value()
        self.assertEqual(self.page.evaluate('navigator.clipboard.readText()'),shared)
        self.page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}})")
        self.page.get_by_role('button',name='Share this moment',exact=True).click()
        expect(self.page.locator('.quality-share-result [role="status"]')).to_contain_text('Automatic copy unavailable')
        expect(self.page.get_by_role('textbox',name='Public replay link',exact=True)).to_have_value(shared)
    def test_history_first_last_and_zero_trade_bookmarks(self):
        run=pick('NVDA','range');self.open(route(run,minute=1))
        expect(self.page.locator('input.tm-scrubber')).to_have_value('0')
        self.page.goto(self.base+route(run,minute=390),wait_until='networkidle')
        expect(self.page.locator('input.tm-scrubber')).to_have_value('389')
        self.page.go_back();expect(self.page.locator('input.tm-scrubber')).to_have_value('0')
        self.page.go_forward();expect(self.page.locator('input.tm-scrubber')).to_have_value('389')
        self.page.get_by_role('button',name='Share this moment',exact=True).click()
        self.assertIn('minute=390',self.page.get_by_role('textbox',name='Public replay link',exact=True).input_value())
        self.open(route(pick('ASML','trend'),minute=66));expect(self.page.locator('input.tm-scrubber')).to_have_value('65')
    def test_sharing_a_playing_replay_pauses_at_the_linked_minute(self):
        self.open(route(pick(),minute=148))
        self.page.get_by_role('button',name='Play replay',exact=True).click()
        self.page.wait_for_function("Number(document.querySelector('input.tm-scrubber').value)>147")
        self.page.get_by_role('button',name='Share this moment',exact=True).click()
        expect(self.page.get_by_role('button',name='Play replay',exact=True)).to_be_visible()
        link=self.page.get_by_role('textbox',name='Public replay link',exact=True).input_value()
        minute=int(parse_qs(urlsplit(link).fragment.split('?')[1])['minute'][0])
        expect(self.page.locator('input.tm-scrubber')).to_have_value(str(minute-1))
    def test_bad_bookmarks_explain_failure_without_fabricating_a_moment(self):
        run=pick()
        for path in (route(run,minute=999),route(run,minute=2).replace(run['result']['datasetChecksum'],'0'*64),route(run,minute=3)+'&minute=4'):
            self.open(path);expect(self.page.locator('.quality-link-error')).to_be_visible()
            expect(self.page.locator('input.tm-scrubber')).to_have_value(str(run['result']['fills'][0]['barIndex']))
    def test_mobile_reading_reflow_and_keyboard_table_scroll(self):
        for width in (320,390,760):
            self.page.set_viewport_size({'width':width,'height':844})
            for path,name in [('/lab.html','lab'),(route(pick(),'review'),'report'),('/training.html?market=historical#/studio?source=trend','strategies')]:
                self.open(path);self.no_page_overflow()
                if name=='report':
                    region=self.page.locator('.rr-trips');region.focus()
                    if region.evaluate('e=>e.scrollWidth>e.clientWidth+1'):
                        self.page.keyboard.press('ArrowRight')
                        self.page.wait_for_function("document.querySelector('.rr-trips').scrollLeft>0")
                if name=='strategies':
                    self.assertGreaterEqual(self.page.locator('.ev-code').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)'),14)
                self.capture(f'{name}-{width}.png')
            self.open(route(pick(),minute=148));self.no_page_overflow();self.capture(f'replay-{width}.png')
        self.page.emulate_media(color_scheme='dark');self.open('/lab.html');self.no_page_overflow()
        self.page.set_viewport_size({'width':320,'height':740});self.open(route(pick(),'review'))
        # Enlarge text independently of layout to catch clipped fixed-height containers.
        self.page.add_style_tag(content='body[data-quality] .rr-report p,body[data-quality] .rr-report small {font-size:28px!important}')
        self.no_page_overflow();self.capture('report-enlarged-text.png')

if __name__=='__main__':
    if os.environ.get('QUALITY_BASELINE')=='1':
        names=['test_general_navigation_is_historical','test_report_uses_the_correct_drawdown_interval','test_replay_has_a_share_control','test_mobile_lab_body_is_readable']
        result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(QualityBrowser(name) for name in names))
        if result.errors or len(result.failures)!=4:raise SystemExit('Baseline did not reproduce exactly the four intended missing behaviours')
        print('Baseline: all four missing behaviours reproduced.')
    else:unittest.main(verbosity=2)
