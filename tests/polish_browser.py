"""Presentation verification on rendered pages, not string-only acceptance."""
import functools,http.server,threading,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa/polish'
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class PolishBrowser(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  OUT.mkdir(parents=True,exist_ok=True);cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}';cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(headless=True)
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':390,'height':844});self.page=self.context.new_page();self.errors=[];self.posts=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.on('request',lambda r:self.posts.append(r.url) if r.method!='GET' else None)
 def tearDown(self):self.context.close();self.assertEqual(self.errors,[]);self.assertEqual(self.posts,[])
 def open(self,path):self.page.goto(self.base+path,wait_until='networkidle')
 def no_overflow(self):self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
 def expand(self,locator):
  self.assertIsNone(locator.get_attribute('open'));locator.locator('summary').focus();self.page.keyboard.press('Enter');expect(locator).to_have_attribute('open','')
 def test_home_strip_matches_terminal_and_preserves_exact_handoffs(self):
  for width in [320,390,1440]:
   self.page.set_viewport_size({'width':width,'height':900});self.open('/');run=self.page.locator('#current-run');run.scroll_into_view_if_needed()
   self.assertEqual(run.evaluate('e=>getComputedStyle(e).backgroundColor'),self.page.locator('#about').evaluate('e=>getComputedStyle(e).backgroundColor'))
   expect(self.page.locator('#p2-replay-at')).to_contain_text('Replay position:');expect(self.page.locator('#p2-completed-outcome')).to_have_text('Full-run outcome: +4.02 USD · 27 fills')
   self.assertNotIn('3df0ac0f',self.page.locator('#p2-current-label').inner_text());self.expand(self.page.locator('.polish-run-details'))
   ident=self.page.locator('#p2-current-id').inner_text();self.assertTrue(self.page.locator('#p2-current-replay').get_attribute('href').endswith(ident));self.no_overflow();run.screenshot(path=str(OUT/f'home-strip-{width}.png'))
 def test_home_minute_and_symbol_remain_distinct_from_full_outcome(self):
  self.open('/');self.page.get_by_role('tab',name='MSFT',exact=True).click();expect(self.page.locator('#p2-current-label')).to_contain_text('MSFT');expect(self.page.locator('#p2-completed-outcome')).to_have_text('Full-run outcome: -2.12 USD · 23 fills')
  self.page.locator('#about').evaluate("e=>e.setAttribute('data-th-cursor','100')");expect(self.page.locator('#p2-replay-at')).to_contain_text('completed minute 101');expect(self.page.locator('#p2-completed-outcome')).to_contain_text('-2.12 USD')
 def test_lab_public_case_precedes_methods_and_boundaries_expand(self):
  for width in [320,390,1440]:
   self.page.set_viewport_size({'width':width,'height':900});self.open('/lab.html');feature=self.page.locator('#lab-featured-research');expect(feature).to_be_visible();self.assertLess(feature.bounding_box()['y'],self.page.locator('#lab-theory-h').bounding_box()['y']);self.assertEqual(feature.locator('a').count(),3)
   self.page.screenshot(path=str(OUT/f'lab-{width}.png'));scope=self.page.locator('#lab-publication-scope');expect(scope.locator('.lab-bounds')).to_be_hidden();self.expand(scope);expect(scope).to_contain_text('human-approved handoff');self.no_overflow()
 def test_ide_details_fold_without_hiding_verdict_or_local_requirement(self):
  for width in [320,390,1440]:
   self.page.set_viewport_size({'width':width,'height':900});self.open('/training.html#/studio');editor=self.page.locator('textarea[aria-label="Edit Python strategy source"]');expect(editor).to_be_visible()
   engine=self.page.locator('.polish-engine-details');digest=self.page.locator('.polish-source-digest');expect(engine.locator('table')).to_be_hidden();expect(digest.locator('code')).to_be_hidden();expect(self.page.locator('.ev-verdict')).to_be_visible();expect(self.page.locator('.ev-runtime')).to_be_visible()
   self.page.screenshot(path=str(OUT/f'ide-folded-{width}.png'),full_page=True);self.expand(engine);self.expand(digest);expect(engine.locator('table')).to_be_visible();expect(digest.locator('code')).to_be_visible();self.no_overflow()
 def test_editing_with_folded_specs_keeps_warning_and_exact_export(self):
  self.open('/training.html#/studio');editor=self.page.locator('textarea[aria-label="Edit Python strategy source"]');expect(editor).to_be_visible();code='# 中文 π\n\ndef on_bar(history, account, state):\n    return None\n';editor.fill(code)
  expect(self.page.locator('.ev-evidence')).to_contain_text('edited');expect(self.page.locator('.ev-verdict')).to_be_visible();self.assertIsNone(self.page.locator('.polish-engine-details').get_attribute('open'))
  with self.page.expect_download() as event:self.page.get_by_role('button',name='Download .py',exact=True).click()
  self.assertEqual(Path(event.value.path()).read_bytes(),code.encode());self.page.reload(wait_until='networkidle');expect(editor).to_have_value(code)
 def test_no_javascript_lab_and_dark_mode_details(self):
  self.context.close();self.context=self.browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844});self.page=self.context.new_page();self.open('/lab.html');self.expand(self.page.locator('#lab-publication-scope'));self.page.locator('#lab-featured-research a').first.click();expect(self.page.locator('#results')).to_be_visible()
  self.context.close();self.context=self.browser.new_context(color_scheme='dark',reduced_motion='reduce',viewport={'width':390,'height':844});self.page=self.context.new_page();self.open('/training.html#/studio');self.expand(self.page.locator('.polish-engine-details'));self.no_overflow();self.page.screenshot(path=str(OUT/'ide-dark.png'),full_page=True)
if __name__=='__main__':unittest.main(verbosity=2)
