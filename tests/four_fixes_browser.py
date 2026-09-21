"""Exercise the approved fixes with real layout, focus and route assertions."""
import functools
import http.server
import json
import os
import sys
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('FOUR_FIXES_EVIDENCE', str(ROOT / 'qa/four-fixes')))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class FourFixesBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True, exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        opts = {'headless': True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):
            opts['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        cls.browser = cls.pw.chromium.launch(**opts)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844})
        self.page = self.context.new_page()
        self.errors, self.writes = [], []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('request', lambda r: self.writes.append(r.url) if r.method != 'GET' else None)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])
        self.assertEqual(self.writes, [])

    def open(self, path):
        self.page.goto(self.base + path, wait_until='networkidle')

    def fits(self, locator):
        expect(locator).to_be_visible()
        box = locator.bounding_box()
        width = self.page.viewport_size['width']
        self.assertGreaterEqual(box['x'], 0)
        self.assertLessEqual(box['x'] + box['width'], width + 1)
        self.assertGreaterEqual(box['height'], 44)
        self.assertTrue(locator.evaluate('e => { const r=e.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return e===hit || e.contains(hit); }'))

    def test_phone_home_case_can_be_opened_with_keyboard(self):
        for width in [320, 390]:
            self.page.set_viewport_size({'width': width, 'height': 844})
            self.open('/')
            card = self.page.locator('#home-featured-case')
            expect(card).to_be_visible()
            card.scroll_into_view_if_needed()
            for link in card.locator('a').all():
                self.fits(link)
            self.page.screenshot(path=str(OUT / f'home-case-{width}.png'))
            card.locator('a[href="/research-algothon.html"]').focus()
            self.page.keyboard.press('Enter')
            self.page.wait_for_url(self.base + '/research-algothon.html')
            expect(self.page.locator('#results')).to_contain_text('1,085.169047')

    def test_phone_navigation_is_complete_on_both_markets_and_all_views(self):
        measurements = []
        for width in [320, 390, 700, 701, 899, 1440]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            for market in ['synthetic', 'historical']:
                for view in ['training', 'market', 'studio']:
                    self.open(f'/training.html?market={market}#/{view}')
                    rail = self.page.locator('.deskrail')
                    expect(rail).to_be_visible()
                    self.assertFalse(rail.evaluate('e => e.scrollWidth > e.clientWidth + 1'))
                    for link in rail.locator('a').all():
                        self.fits(link)
                    views = rail.locator('nav').bounding_box()
                    modes = rail.locator('.deskrail-market').bounding_box()
                    if width <= 700:
                        self.assertGreaterEqual(modes['y'], views['y'] + views['height'])
                    elif width == 1440:
                        self.assertAlmostEqual(modes['y'], views['y'], delta=2)
                    expect(rail.locator('nav a[aria-current="page"]')).to_have_text({'training':'Overview','market':'Trading','studio':'IDE'}[view])
                    expect(rail.locator('.deskrail-market a[aria-current="true"]')).to_have_text(market.title())
                    self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
                    measurements.append({'width': width, 'market': market, 'view': view, 'views': views, 'modes': modes})
                    if width in [320, 390, 1440] and market == 'synthetic':
                        self.page.screenshot(path=str(OUT / f'nav-{view}-{width}.png'))
        (OUT / 'navigation-measurements.json').write_text(json.dumps(measurements, indent=2))

    def test_catalogue_matches_on_home_phone_and_lab(self):
        self.open('/')
        expect(self.page.locator('.lab-phone-rows')).to_contain_text('4 methods · 4 cases')
        self.assertEqual(self.page.locator('.s1-lib [data-case-id]').evaluate_all('nodes => nodes.map(n => n.dataset.caseId)'), ['ire', 'pxa', 'etf-pricing', 'algothon'])
        expect(self.page.locator('.s1-lib h3').first).to_have_text('Case archives 4')
        self.open('/lab.html')
        self.assertEqual(self.page.locator('tr[data-case-id]').evaluate_all('nodes => nodes.map(n => n.dataset.caseId)'), ['ire', 'pxa', 'etf-pricing', 'algothon'])
        expect(self.page.locator('.lab-scope div').filter(has_text='Archives')).to_have_text('Archives4')

    def test_profile_has_two_separate_comparison_statements(self):
        self.open('/profile.html#project-algothon')
        rows = self.page.locator('#project-algothon .evaluation-comparisons p')
        expect(rows).to_have_count(2)
        expect(rows.nth(0)).to_have_text('3.7 points behind second place.')
        expect(rows.nth(1)).to_have_text('About 0.4 of one block’s standard error from the public-data replay mean.')
        for width in [320, 390, 1440]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.page.locator('.evaluation-comparisons').screenshot(path=str(OUT / f'profile-comparisons-{width}.png'))
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))

    def test_market_switch_and_view_switch_keep_active_context(self):
        for width in [320, 390]:
            self.page.set_viewport_size({'width':width,'height':844})
            self.open('/training.html#/studio')
            market = self.page.locator('.deskrail-market')
            market.get_by_role('link', name='Historical', exact=True).focus()
            self.page.keyboard.press('Enter')
            self.page.wait_for_url(self.base + '/training.html?market=historical#/market')
            expect(market.locator('[aria-current="true"]')).to_have_text('Historical')
            self.page.get_by_role('navigation', name='Desk views').get_by_role('link', name='IDE', exact=True).click()
            expect(self.page.get_by_role('button', name='Download .py', exact=True)).to_be_visible()
            self.assertIn('market=historical#/studio', self.page.url)
            market.get_by_role('link', name='Synthetic', exact=True).click()
            self.page.wait_for_url(self.base + '/training.html#/market')
            expect(market.locator('[aria-current="true"]')).to_have_text('Synthetic')

    def test_phone_case_is_present_without_javascript(self):
        self.context.close()
        self.context = self.browser.new_context(java_script_enabled=False, viewport={'width':320,'height':844})
        self.page = self.context.new_page()
        self.open('/')
        card = self.page.locator('#home-featured-case')
        expect(card).to_be_visible()
        self.assertEqual(card.locator('a').count(), 3)
        card.locator('a[href="/research-algothon.html"]').click()
        expect(self.page.locator('#results')).to_contain_text('1,085.169047')

    def test_resize_dark_mode_and_focus_visibility(self):
        self.page.emulate_media(color_scheme='dark', reduced_motion='reduce')
        self.open('/training.html#/market')
        self.page.keyboard.press('Tab')
        for width in [1440, 320, 390, 1440, 320]:
            self.page.set_viewport_size({'width':width,'height':844})
            for link in self.page.locator('.deskrail a').all():
                self.fits(link)
                link.focus()
                self.assertGreater(float(link.evaluate('e => parseFloat(getComputedStyle(e).outlineWidth)')), 0)
        self.page.screenshot(path=str(OUT / 'nav-dark-320.png'))
        self.open('/')
        self.page.set_viewport_size({'width':1440,'height':900})
        expect(self.page.locator('#home-featured-case')).to_be_hidden()
        expect(self.page.locator('.s1-lib')).to_be_visible()

if __name__ == '__main__':
    if '--expect-regressions' in sys.argv:
        names = [
            'test_phone_home_case_can_be_opened_with_keyboard',
            'test_phone_navigation_is_complete_on_both_markets_and_all_views',
            'test_catalogue_matches_on_home_phone_and_lab',
            'test_profile_has_two_separate_comparison_statements',
        ]
        result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(FourFixesBrowser(n) for n in names))
        # Only the four expected assertion failures are accepted, never browser/setup errors.
        sys.exit(0 if len(result.failures) == 4 and not result.errors else 1)
    unittest.main(verbosity=2)
