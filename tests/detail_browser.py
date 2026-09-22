"""Real browser layout, navigation, theme and foreground/background regressions."""
import functools, http.server, json, os, subprocess, tempfile, threading, time, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'qa/detail'
RUN = '3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
class DetailBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True,exist_ok=True)
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start(); cls.browser=cls.pw.chromium.launch(headless=True)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
        self.page=self.context.new_page(); self.errors=[]; self.failed=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('response',lambda r:self.failed.append((r.url,r.status)) if r.status>=400 else None)
    def tearDown(self):
        self.context.close(); self.assertEqual(self.errors,[]); self.assertEqual(self.failed,[])
    def open(self,path='/'):
        response=self.page.goto(self.base+path,wait_until='networkidle'); self.assertEqual(response.status,200)
    def no_overflow(self):
        self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth+1'))
    def capture(self,name):
        self.page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
        self.page.screenshot(path=str(OUT/name),full_page=True)
    def test_phone_terminal_is_compact_and_all_controls_are_visible(self):
        measurements=[]
        for width in (320,390,700):
            heights=[]
            for height in (667,1000):
                self.page.set_viewport_size({'width':width,'height':height}); self.open()
                expect(self.page.locator('.th-replay-tag')).to_be_visible()
                expect(self.page.locator('.th-footer a')).to_have_text('Open full demo →')
                data=self.page.locator('.terminal-hero').evaluate('''e=>{
                  const rect=s=>e.querySelector(s).getBoundingClientRect();
                  const tabs=[...e.querySelectorAll('.th-tab')].map(t=>t.getBoundingClientRect());
                  const strip=rect('.th-tabs'),book=rect('.th-book-panel');
                  return {hero:e.getBoundingClientRect().height,chart:rect('.th-chart').height,
                    tabsVisible:tabs.every(t=>t.left>=strip.left-1&&t.right<=strip.right+1),
                    bookFits:[...e.querySelectorAll('.th-ladder tbody tr')].every(r=>r.getBoundingClientRect().bottom<=book.bottom+1)};
                }''')
                self.assertLessEqual(data['hero'],540); self.assertGreaterEqual(data['chart'],140)
                self.assertTrue(data['tabsVisible']); self.assertTrue(data['bookFits'])
                heights.append(data['hero']); measurements.append({'width':width,'height':height,**data}); self.no_overflow()
            self.assertLessEqual(abs(heights[1]-heights[0]),1,'Phone terminal should follow width, not grow with screen height')
            self.capture(f'home-{width}.png')
        (OUT/'phone-layout.json').write_text(json.dumps(measurements,indent=2))
    def test_home_actions_and_profile_have_clean_copy(self):
        self.open(); cards=self.page.locator('.demo-featured-runs article'); expect(cards).to_have_count(3)
        for card in cards.all():
            self.assertNotIn('1 fills',card.inner_text())
            for label in ('Watch replay','View source','Read report'):
                expect(card.get_by_role('link',name=label,exact=True)).to_be_visible()
        cards.first.get_by_role('link',name='Watch replay',exact=True).click()
        expect(self.page.locator('.tm-scrubber')).to_be_visible(); self.assertIn(RUN,self.page.url)
        self.open('/profile.html#project-algothon')
        feature=self.page.locator('#project-algothon'); self.assertEqual(feature.inner_text().count('3.7 points'),1)
        expect(feature.get_by_text('Method · evidence limits',exact=True)).to_be_visible()
    def test_main_pages_at_breakpoints_and_both_themes(self):
        routes={'home':'/','profile':'/profile.html','lab':'/lab.html','overview':'/training.html?market=historical#/training','trading':'/training.html?market=historical#/market','strategy':'/training.html?market=historical#/studio'}
        for theme in ('light','dark'):
            self.page.emulate_media(color_scheme=theme)
            for width in (320,390,760,1000,1440):
                self.page.set_viewport_size({'width':width,'height':900})
                for name,path in routes.items():
                    with self.subTest(theme=theme,width=width,page=name):
                        self.open(path); self.no_overflow()
                        self.assertEqual(self.page.locator('.blue-white-home,.home-intro,.copy-details').count(),0)
                        self.assertEqual(self.page.locator('h1').count(),1)
                        if width in (390,1440): self.capture(f'{name}-{width}-{theme}.png')
    def test_keyboard_controls_and_theme_survive_navigation(self):
        self.page.set_viewport_size({'width':320,'height':800}); self.open()
        self.page.locator('#th-tab-0').focus(); self.page.keyboard.press('End')
        expect(self.page.locator('#th-tab-3')).to_be_focused(); expect(self.page.locator('#th-tab-3')).to_have_attribute('aria-selected','true')
        self.page.keyboard.press('Home'); expect(self.page.locator('#th-tab-0')).to_have_attribute('aria-selected','true')
        button=self.page.locator('#theme'); button.click(); button.click()
        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')
        self.page.get_by_role('link',name='Profile',exact=True).click()
        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')
        self.page.locator('#project-market-making > summary').focus(); self.page.keyboard.press('Enter')
        expect(self.page.locator('#project-market-making')).to_have_attribute('open','')
    def test_no_javascript_preserves_terminal_and_project_links(self):
        with self.browser.new_context(java_script_enabled=False,viewport={'width':320,'height':800}) as c:
            p=c.new_page(); p.goto(self.base,wait_until='networkidle')
            expect(p.locator('.th-replay-tag')).to_be_visible()
            self.assertFalse(p.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
            expect(p.locator('.th-footer a')).to_have_attribute('href',__import__('re').compile('view=replay'))
            p.locator('#published-runs>summary').click(); expect(p.locator('#published-runs')).to_have_attribute('open','')
            p.screenshot(path=str(OUT/'home-noscript-320.png'),full_page=True)
    def test_hidden_tab_pauses_without_automatic_restart(self):
        # Independent native Chromium, not a spoofed visibilitychange or hidden property.
        with tempfile.TemporaryDirectory() as profile:
            proc=subprocess.Popen([self.pw.chromium.executable_path,'--no-sandbox','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            remote=None
            try:
                portfile=Path(profile)/'DevToolsActivePort'
                for _ in range(100):
                    if portfile.exists(): break
                    time.sleep(.1)
                self.assertTrue(portfile.exists(),'native browser did not expose its debugging port')
                remote=self.pw.chromium.connect_over_cdp('http://127.0.0.1:'+portfile.read_text().splitlines()[0])
                c=remote.contexts[0]; p=c.pages[0]
                p.goto(self.base+'/training.html?market=historical#/market?view=replay&run='+RUN,wait_until='networkidle')
                slider=p.locator('input.tm-scrubber'); slider.focus(); slider.press('Home')
                for _ in range(40): slider.press('ArrowRight')
                expect(slider).to_have_value('40')
                p.get_by_role('button',name='Play replay',exact=True).click()
                p.wait_for_function('Number(document.querySelector(".tm-scrubber").value)>40')
                other=c.new_page(); other.goto(self.base+'/profile.html'); other.bring_to_front()
                p.wait_for_function('document.hidden===true')
                time.sleep(.25); hidden=int(p.locator('.tm-scrubber').input_value()); time.sleep(1)
                self.assertEqual(int(p.locator('.tm-scrubber').input_value()),hidden)
                p.bring_to_front(); p.wait_for_function('document.hidden===false'); time.sleep(.6)
                self.assertEqual(int(p.locator('.tm-scrubber').input_value()),hidden)
                expect(p.get_by_role('button',name='Play replay',exact=True)).to_be_visible()
                p.get_by_role('button',name='Play replay',exact=True).click()
                p.wait_for_function('(n)=>Number(document.querySelector(".tm-scrubber").value)>n',arg=hidden)
                (OUT/'background-playback.json').write_text(json.dumps({'hiddenCursor':hidden,'resumedCursor':int(p.locator('.tm-scrubber').input_value()),'realVisibility':True}))
                # Manual tape uses the other controller and must also remain paused on return.
                p.goto(self.base+'/training.html?market=historical#/market',wait_until='networkidle')
                p.get_by_role('button',name='Play the tape',exact=True).click()
                expect(p.get_by_role('button',name='Pause the tape',exact=True)).to_be_visible()
                other.bring_to_front(); p.wait_for_function('document.hidden===true'); time.sleep(.6)
                expect(p.get_by_role('button',name='Play the tape',exact=True)).to_be_visible()
                p.bring_to_front(); p.wait_for_function('document.hidden===false'); time.sleep(.6)
                expect(p.get_by_role('button',name='Play the tape',exact=True)).to_be_visible()
            finally:
                if remote: remote.close()
                if proc.poll() is None: proc.terminate()
                try: proc.wait(timeout=5)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait()

if __name__=='__main__': unittest.main(verbosity=2)
