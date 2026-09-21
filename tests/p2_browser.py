"""Actual Chromium P2 user journeys. Run against a local copy of the public artifact."""
import functools,http.server,json,os,threading,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa'/'p2'
RUNS=[]
for kind in ['historical','synthetic']:
 RUNS.extend(json.loads((ROOT/f'data/published-runs-{kind}.json').read_text())['markets'][kind]['runs'])
def rid(symbol,task='trend'):return next(r['result']['runId'] for r in RUNS if r['symbol']==symbol and r['taskId']==task)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class Browser(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  OUT.mkdir(parents=True,exist_ok=True)
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=cls.server.serve_forever,daemon=True).start()
  cls.base=f'http://127.0.0.1:{cls.server.server_port}';cls.pw=sync_playwright().start();opts={'headless':True}
  if os.environ.get('CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  cls.browser=cls.pw.chromium.launch(**opts)
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':1440,'height':900});self.page=self.context.new_page();self.page.set_default_timeout(12000);self.errors=[];self.writes=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.on('request',lambda r:self.writes.append(r.url) if r.method!='GET' else None)
 def tearDown(self):
  self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')),full_page=True);self.context.close();self.assertEqual(self.errors,[]);self.assertEqual(self.writes,[])
 def goto(self,path):
  r=self.page.goto(self.base+path,wait_until='networkidle')
  if r:self.assertEqual(r.status,200)
 def ready(self):expect(self.page.locator('#comparison-result')).to_be_visible()
 def choose(self,a,b):
  self.page.locator('#a-run').select_option(a);self.page.locator('#b-run').select_option(b);self.ready()
 def test_default_comparison_reconciles_and_draws_all_three_paths(self):
  self.goto('/compare.html');self.ready();self.assertEqual(self.page.locator('#a-run').input_value(),rid('AAPL'))
  self.assertEqual(self.page.locator('#metrics [data-metric="netPnl"] td').all_text_contents(),['4.02','6.68','+2.66'])
  self.assertEqual(self.page.locator('#comparison-chart path').count(),3);self.assertEqual(self.page.locator('#comparison-data tbody tr').count(),390)
  expect(self.page.locator('#benchmark-note')).to_contain_text('No benchmark fees or slippage')
 def test_all_five_instruments_compare_on_their_own_tapes(self):
  self.goto('/compare.html');self.ready()
  for symbol in ['^GSPC','AAPL','MSFT','NVDA','ASML']:
   self.choose(rid(symbol),rid(symbol,'range'));expect(self.page.locator('#comparison-title')).to_contain_text(symbol)
   self.assertEqual(self.page.locator('#comparison-status').get_attribute('data-error'),'false')
 def test_cross_market_comparison_is_blocked_and_recovers(self):
  self.goto('/compare.html');self.ready();self.page.locator('#b-run').select_option(rid('ASML'))
  expect(self.page.locator('#comparison-result')).to_be_hidden();expect(self.page.locator('#comparison-status')).to_contain_text('Cannot compare')
  self.page.locator('#b-run').select_option(rid('AAPL','range'));self.ready()
 def test_selection_survives_refresh_back_forward_and_swap(self):
  self.goto('/compare.html');self.ready();self.choose(rid('MSFT'),rid('MSFT','range'));chosen=self.page.url
  self.page.reload(wait_until='networkidle');self.ready();self.assertEqual(self.page.url,chosen)
  self.page.get_by_role('button',name='Swap A and B',exact=True).click();self.ready();self.assertEqual(self.page.locator('#a-run').input_value(),rid('MSFT','range'))
  self.page.go_back();self.ready();self.assertEqual(self.page.locator('#a-run').input_value(),rid('MSFT'))
  self.page.go_forward();self.ready();self.assertEqual(self.page.locator('#a-run').input_value(),rid('MSFT','range'))
 def test_invalid_shared_link_shows_error_without_silent_fallback(self):
  self.goto('/compare.html?a=missing');expect(self.page.locator('#comparison-status')).to_contain_text('Unknown published run')
  expect(self.page.locator('#comparison-result')).to_be_hidden();self.page.get_by_role('link',name='Reset selection',exact=True).click();self.ready()
 def test_keyboard_minute_inspection_and_swap(self):
  self.goto('/compare.html');self.ready();s=self.page.locator('#minute');s.focus();self.page.keyboard.press('Home');self.assertEqual(s.input_value(),'0')
  expect(self.page.locator('#minute-values')).to_contain_text('09:30');self.page.keyboard.press('End');expect(self.page.locator('#minute-values')).to_contain_text('15:59')
  self.page.get_by_role('button',name='Swap A and B',exact=True).focus();self.page.keyboard.press('Enter');self.ready()
  self.assertEqual(self.page.locator('#metrics [data-metric="netPnl"] td').all_text_contents(),['6.68','4.02','-2.66'])
 def test_report_replay_and_source_keep_exact_context(self):
  self.goto('/compare.html?a='+rid('NVDA','range')+'&b='+rid('NVDA','hold'));self.ready()
  for name,needle in [('Report A','view=review&run='+rid('NVDA','range')),('Replay A','view=replay&run='+rid('NVDA','range')),('Source A','/studio?source=range')]:
   self.page.get_by_role('link',name=name,exact=True).click();self.page.wait_for_load_state('networkidle');self.assertIn('market=historical',self.page.url);self.assertIn(needle,self.page.url)
   if name=='Source A':expect(self.page.locator('#ev-tab-range')).to_have_attribute('aria-selected','true')
   self.page.go_back(wait_until='networkidle');self.ready()
 def test_corrupted_payload_is_rejected_before_plotting(self):
  self.page.route('**/data/published-runs-historical.json',lambda route:route.fulfill(status=200,body='{}',content_type='application/json'))
  self.goto('/compare.html');expect(self.page.locator('#comparison-status')).to_contain_text('checksum does not match');expect(self.page.locator('#comparison-result')).to_be_hidden()
  self.page.unroute('**/data/published-runs-historical.json');self.page.get_by_role('button',name='Retry loading',exact=True).click();self.ready()
 def test_failed_data_request_has_recovery(self):
  self.page.route('**/data/published-runs-synthetic.json',lambda route:route.fulfill(status=503,body='Unavailable'))
  self.goto('/compare.html');expect(self.page.locator('#comparison-status')).to_contain_text('HTTP 503');expect(self.page.locator('#retry-load')).to_be_visible()
 def test_home_instrument_switch_updates_result_highlight_and_handoffs(self):
  self.goto('/')
  for symbol,tab in [('MSFT','MSFT'),('NVDA','NVDA'),('^GSPC','S&P 500'),('AAPL','AAPL')]:
   self.page.get_by_role('tab',name=tab,exact=True).click();expect(self.page.locator('#p2-current-label')).to_contain_text(symbol)
   self.assertTrue(self.page.locator('#p2-current-replay').get_attribute('href').endswith('run='+rid(symbol)))
   self.assertTrue(self.page.locator('#p2-current-source').get_attribute('href').endswith('source=trend'))
   selected=self.page.locator('#published-runs a[aria-current="true"]');self.assertEqual(selected.count(),2)
   self.assertEqual(set(selected.evaluate_all('(nodes)=>nodes.map(n=>n.dataset.p2Run)')),{rid(symbol)})
  self.page.locator('#p2-current-compare').click();self.ready();self.assertEqual(self.page.locator('#a-run').input_value(),rid('AAPL'))
 def test_case_and_evidence_links_work_without_javascript(self):
  self.context.close();self.context=self.browser.new_context(java_script_enabled=False);self.page=self.context.new_page()
  for path in ['/profile.html#project-algothon','/lab.html#archive-algothon','/']:
   self.goto(path);self.assertGreater(self.page.locator('a[href="/research-algothon.html"]').count(),0)
  self.goto('/research-algothon.html');expect(self.page.locator('#results')).to_contain_text('1,085.169047')
  for part in ['question','data','method','results','limits','sources']:self.assertEqual(self.page.locator('#'+part).count(),1)
  self.goto('/compare.html');expect(self.page.locator('noscript')).to_contain_text('Interactive comparison needs JavaScript')
 def test_desktop_short_phone_small_phone_and_dark_mode(self):
  for width,height in [(1440,900),(1440,600),(390,844),(320,740)]:
   self.page.set_viewport_size({'width':width,'height':height})
   for path in ['/compare.html','/research-algothon.html','/']:
    self.goto(path)
    if path=='/compare.html':self.ready();self.assertGreater(self.page.locator('#comparison-chart svg').bounding_box()['height'],250)
    self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),f'{path} {width}')
    self.page.screenshot(path=str(OUT/(f'viewport-{width}-{height}-'+(path.strip('/') or 'home')+'.png')),full_page=True)
  self.page.emulate_media(color_scheme='dark',reduced_motion='reduce');self.goto('/compare.html');self.ready();self.page.screenshot(path=str(OUT/'comparison-dark-phone.png'),full_page=True)
if __name__=='__main__':unittest.main(verbosity=2)
