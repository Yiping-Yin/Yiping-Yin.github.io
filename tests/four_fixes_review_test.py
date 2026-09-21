"""PR review regressions: direct-link targets and an unconditional pinned baseline."""
import functools
import http.server
import json
import os
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('REVIEW_EVIDENCE', str(ROOT / 'qa/four-fixes/review')))


class BaselineWorkflow(unittest.TestCase):
    def test_baseline_is_pinned_and_not_gated_by_generated_marker(self):
        workflow = (ROOT / '.github/workflows/first-four-fixes.yml').read_text()
        step = workflow.split('- name: Reproduce all four original browser regressions', 1)[1].split('- name:', 1)[0]
        self.assertNotIn('if ! grep', step)
        self.assertIn('BASELINE_SHA: 7acdc4732ce09294bc21f27c9b688484ef2fc7f5', step)
        self.assertIn('git archive "$BASELINE_SHA"', step)
        self.assertIn('python "$baseline/tests/four_fixes_browser.py" --expect-regressions', step)
        self.assertIn('fetch-depth: 0', workflow)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class DesktopCaseTarget(unittest.TestCase):
    def test_direct_case_link_has_44px_target_and_keyboard_access(self):
        OUT.mkdir(parents=True, exist_ok=True)
        measurements = []
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with sync_playwright() as pw:
                options = {'headless': True}
                if os.environ.get('CHROMIUM_EXECUTABLE'):
                    options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
                browser = pw.chromium.launch(**options)
                try:
                    for width in [900, 1024, 1440]:
                        for theme in ['light', 'dark']:
                            context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=theme, reduced_motion='reduce')
                            try:
                                page = context.new_page()
                                errors = []
                                page.on('pageerror', lambda error: errors.append(str(error)))
                                page.goto(base + '/', wait_until='networkidle')
                                link = page.locator('.s1-lib > div > a.p2-case-entry')
                                expect(link).to_be_visible()
                                link.scroll_into_view_if_needed()
                                box = link.bounding_box()
                                measurements.append({'width': width, 'theme': theme, 'box': box})
                                self.assertGreaterEqual(box['height'], 44, f'{width}px {theme}: {box}')
                                self.assertGreaterEqual(box['x'], 0)
                                self.assertLessEqual(box['x'] + box['width'], width + 1)
                                self.assertTrue(link.evaluate('e => { const r=e.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return e===hit || e.contains(hit); }'))
                                link.focus()
                                self.assertGreater(float(link.evaluate('e => parseFloat(getComputedStyle(e).outlineWidth)')), 0)
                                page.locator('.s1-lib').screenshot(path=str(OUT / f'desktop-case-{width}-{theme}.png'))
                                page.keyboard.press('Enter')
                                page.wait_for_url(base + '/research-algothon.html')
                                expect(page.locator('#results')).to_contain_text('1,085.169047')
                                self.assertEqual(errors, [])
                            finally:
                                context.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()
            (OUT / 'desktop-case-targets.json').write_text(json.dumps(measurements, indent=2))


if __name__ == '__main__':
    unittest.main(verbosity=2)
