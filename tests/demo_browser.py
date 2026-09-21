"""Four approved public-demo journeys; baseline mode requires four real failures."""
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from urllib.parse import parse_qs, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa/demo'

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class DemoBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True, exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.page = self.context.new_page()
        self.errors = []
        self.posts = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('request', lambda req: self.posts.append(req.url) if req.method != 'GET' else None)

    def tearDown(self):
        if self.page.url.startswith(self.base):
            self.page.screenshot(path=str(OUT / (self.id().split('.')[-1] + '.png')), full_page=True)
        self.context.close()
        self.assertEqual(self.errors, [])
        self.assertEqual(self.posts, [])

    def capture(self, name):
        # Capture from the document top so sticky headers do not appear halfway
        # through a full-page image after an interaction scrolled the viewport.
        self.page.evaluate('window.scrollTo(0, 0)')
        self.page.wait_for_function('window.scrollY === 0')
        self.page.screenshot(path=str(OUT / name), full_page=True)

    def open(self, path):
        self.page.goto('about:blank')
        self.page.goto(self.base + path, wait_until='networkidle')

    def test_home_enters_historical_demo(self):
        self.open('/')
        link = self.page.locator('.s1-doors a').filter(has_text='Trading')
        self.assertEqual(parse_qs(urlsplit(link.get_attribute('href')).query).get('market'), ['historical'])
        link.click()
        self.assertEqual(parse_qs(urlsplit(self.page.url).query).get('market'), ['historical'])
        expect(self.page.get_by_role('link', name='Historical', exact=True)).to_be_visible()

    def test_strategies_are_read_first_and_still_export_drafts(self):
        for width in (320, 390, 1440):
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.open('/training.html#/studio')
            expect(self.page.locator('h1')).to_have_text('Strategies')
            editor = self.page.locator('textarea[aria-label="Edit Python strategy source"]')
            self.assertTrue(editor.evaluate('e => e.readOnly'))
            expect(self.page.locator('.ev-runtime')).to_have_count(0)
            expect(self.page.locator('.demo-strategy-intro')).to_be_visible()
            self.page.get_by_role('button', name='Edit', exact=True).click()
            expect(editor).to_be_editable()
            code = '# UTF-8 中文 π\n\ndef on_bar(history, account, state):\n    return None\n'
            editor.fill(code)
            expect(self.page.locator('.ev-evidence')).to_contain_text('edited')
            with self.page.expect_download() as event:
                self.page.get_by_role('button', name='Download .py', exact=True).click()
            self.assertEqual(Path(event.value.path()).read_bytes(), code.encode())
            self.page.get_by_role('button', name='Done', exact=True).click()
            self.assertTrue(editor.evaluate('e => e.readOnly'))
            self.page.reload(wait_until='networkidle')
            expect(editor).to_have_value(code)
            self.page.get_by_role('button', name='Restore published source', exact=True).click()
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
            self.capture(f'strategies-{width}.png')

    def test_home_features_three_matching_tapes_and_retains_all_runs(self):
        for width in (320, 390, 1440):
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.open('/')
            cards = self.page.locator('.demo-featured-runs article')
            expect(cards).to_have_count(3)
            self.assertEqual(cards.locator('[data-demo-symbol]').all_text_contents(), ['AAPL', 'AAPL', 'AAPL'])
            ids = cards.evaluate_all('cards => cards.map(c => c.dataset.runId)')
            self.assertEqual(len(set(ids)), 3)
            for card in cards.all():
                replay = card.get_by_role('link', name='Replay', exact=True)
                self.assertIn('market=historical', replay.get_attribute('href'))
                self.assertTrue(replay.get_attribute('href').endswith(card.get_attribute('data-run-id')))
                expect(card.get_by_role('link', name='Source', exact=True)).to_be_visible()
            self.capture(f'home-folded-{width}.png')
            archive = self.page.locator('#published-runs')
            self.assertEqual(archive.evaluate('e => e.tagName'), 'DETAILS')
            self.assertIsNone(archive.get_attribute('open'))
            archive.locator(':scope > summary').focus()
            self.page.keyboard.press('Enter')
            expect(archive).to_have_attribute('open', '')
            self.assertEqual(archive.locator('table.s1-runs-wide a[data-p2-run]').count(), 15)
            self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
            self.capture(f'home-{width}.png')
            self.open('/#published-runs')
            expect(self.page.locator('#published-runs')).to_have_attribute('open', '')
        self.context.close()
        self.context = self.browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 844})
        self.page = self.context.new_page()
        self.open('/')
        expect(self.page.locator('.demo-featured-runs article')).to_have_count(3)
        self.page.locator('#published-runs > summary').click()
        expect(self.page.locator('#published-runs')).to_have_attribute('open', '')

    def test_strategy_selection_survives_reload_back_forward_and_sharing(self):
        self.open('/training.html?market=historical#/studio?source=trend&view=source')
        self.page.locator('#ev-tab-hold').click()
        self.assertEqual(parse_qs(urlsplit(self.page.url).fragment.partition('?')[2]).get('source'), ['hold'])
        expect(self.page.locator('#ev-tab-hold')).to_have_attribute('aria-selected', 'true')
        self.page.get_by_role('button', name='Edit', exact=True).click()
        draft = '# HOLD draft, kept when switching sources\n'
        self.page.locator('textarea[aria-label="Edit Python strategy source"]').fill(draft)
        self.page.reload(wait_until='networkidle')
        expect(self.page.locator('#ev-tab-hold')).to_have_attribute('aria-selected', 'true')
        self.page.locator('#ev-tab-range').click()
        shared = self.page.url
        self.page.go_back(wait_until='networkidle')
        expect(self.page.locator('#ev-tab-hold')).to_have_attribute('aria-selected', 'true')
        expect(self.page.locator('textarea[aria-label="Edit Python strategy source"]')).to_have_value(draft)
        self.page.go_back(wait_until='networkidle')
        expect(self.page.locator('#ev-tab-trend')).to_have_attribute('aria-selected', 'true')
        self.page.go_forward(wait_until='networkidle')
        expect(self.page.locator('#ev-tab-hold')).to_have_attribute('aria-selected', 'true')
        self.page.go_forward(wait_until='networkidle')
        expect(self.page.locator('#ev-tab-range')).to_have_attribute('aria-selected', 'true')
        self.page.goto('about:blank')
        self.page.goto(shared, wait_until='networkidle')
        expect(self.page.locator('#ev-tab-range')).to_have_attribute('aria-selected', 'true')
        self.assertEqual(parse_qs(urlsplit(shared).query).get('market'), ['historical'])
        self.assertEqual(parse_qs(urlsplit(shared).fragment.partition('?')[2]).get('view'), ['source'])
        self.page.locator('#ev-tab-range').focus()
        self.page.keyboard.press('ArrowLeft')
        expect(self.page.locator('#ev-tab-hold')).to_be_focused()
        expect(self.page.locator('#ev-tab-hold')).to_have_attribute('aria-selected', 'true')

if __name__ == '__main__':
    if os.environ.get('DEMO_BASELINE') == '1':
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DemoBrowser))
        expected = result.testsRun == 4 and len(result.failures) == 4 and not result.errors
        print('EXPECTED BASELINE: four missing behaviors reproduced' if expected else 'UNEXPECTED BASELINE RESULT')
        raise SystemExit(0 if expected else 1)
    unittest.main(verbosity=2)
