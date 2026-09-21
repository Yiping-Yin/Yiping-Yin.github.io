"""Responsive chart labels and 404 recovery: real browser, no account mutations."""
import functools,http.server,json,os,threading,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('CLOSEOUT_EVIDENCE',str(ROOT/'qa/closeout')))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
class Closeout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True,exist_ok=True)
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start();opts={'headless':True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
        cls.browser=cls.pw.chromium.launch(**opts)
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':320,'height':740});self.page=self.context.new_page()
        self.errors=[];self.writes=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('request',lambda r:self.writes.append(r.url) if r.method!='GET' else None)
    def tearDown(self):
        self.context.close();self.assertEqual(self.errors,[]);self.assertEqual(self.writes,[])
    def open(self,path):self.page.goto(self.base+path,wait_until='networkidle')
    def test_narrow_time_labels_have_readable_spacing(self):
        self.open('/compare.html');expect(self.page.locator('#comparison-result')).to_be_visible()
        measurements=[]
        for w in [320,390,1440,390,320]:
            self.page.set_viewport_size({'width':w,'height':900 if w==1440 else 844})
            self.page.wait_for_timeout(120)
            boxes=self.page.locator('#comparison-chart svg text').evaluate_all("nodes=>nodes.filter(n=>/^\\d{2}:\\d{2}$/.test(n.textContent)).map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,left:r.left,right:r.right}})")
            gaps=[b['left']-a['right'] for a,b in zip(boxes,boxes[1:])]
            measurements.append({'width':w,'labels':boxes,'minimumGap':min(gaps)})
            self.page.screenshot(path=str(OUT/f'compare-{w}.png'),full_page=True)
            self.assertGreaterEqual(min(gaps),12,f'{w}px ticks are crowded: {gaps}')
            self.assertEqual(boxes[0]['text'],'09:30');self.assertEqual(boxes[-1]['text'],'15:59')
            self.assertEqual(self.page.locator('#comparison-chart path').count(),3)
            self.assertEqual(self.page.locator('#comparison-data tbody tr').count(),390)
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
        (OUT/'chart-measurements.json').write_text(json.dumps(measurements,indent=2))
    def test_404_recovery_links_open_all_published_pages(self):
        paths=['/#top','/profile.html','/training.html?market=historical#/market','/lab.html','/compare.html','/research-algothon.html']
        for path in paths:
            self.open('/404.html');link=self.page.locator(f'.ways a[href="{path}"]')
            expect(link).to_be_visible();link.focus();self.page.keyboard.press('Enter')
            self.page.wait_for_url(self.base+path);self.page.wait_for_load_state('networkidle')
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
        self.open('/404.html');self.page.screenshot(path=str(OUT/'404-mobile.png'),full_page=True)
    def test_dark_chart_retains_keyboard_minute_inspection(self):
        self.page.emulate_media(color_scheme='dark',reduced_motion='reduce')
        self.open('/compare.html');expect(self.page.locator('#comparison-result')).to_be_visible()
        self.page.locator('#minute').focus();self.page.keyboard.press('Home')
        expect(self.page.locator('#minute-values')).to_contain_text('09:30')
        self.page.keyboard.press('End');expect(self.page.locator('#minute-values')).to_contain_text('15:59')
        self.page.screenshot(path=str(OUT/'compare-dark-320.png'),full_page=True)
if __name__=='__main__':unittest.main(verbosity=2)
