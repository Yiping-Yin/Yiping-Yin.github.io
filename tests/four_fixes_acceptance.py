"""Contracts for the four approved audit fixes, including non-JS content."""
import json
import re
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = 'https://github.com/Yiping-Yin/algothon-2026/blob/main/Algothon-Research-Report.pdf'
CODE = 'https://github.com/Yiping-Yin/algothon-2026'

class FourFixesAcceptance(unittest.TestCase):
    def test_phone_home_has_its_own_public_case_links(self):
        page = (ROOT / 'index.html').read_text()
        phone = page[page.index('<div class="lab-phone">'):]
        self.assertIn('id="home-featured-case"', phone)
        for url in ['/research-algothon.html', REPORT, CODE]:
            self.assertIn(f'href="{url}"', phone)
        self.assertNotIn('The notes are not published.', phone)

    def test_phone_navigation_has_two_explicit_rows(self):
        page = (ROOT / 'training.html').read_text()
        self.assertIn('/portfolio-assets/four-fixes.css?v=1', page)
        css = (ROOT / 'portfolio-assets/four-fixes.css').read_text()
        self.assertIn('@media (max-width: 700px)', css)
        self.assertIn('.deskrail nav', css)
        self.assertIn('.deskrail-market', css)
        self.assertIn('repeat(3, minmax(0, 1fr))', css)
        self.assertIn('repeat(2, minmax(0, 1fr))', css)

    def test_case_counts_and_entries_share_one_catalogue(self):
        home = (ROOT / 'index.html').read_text()
        lab = (ROOT / 'lab.html').read_text()
        self.assertIn('Case archives <span>4</span>', home)
        self.assertIn('4 methods · 4 cases', home)
        self.assertNotIn('PXA &amp; ETF pricing', home)
        catalogue = json.loads((ROOT / 'scripts/public_case_catalogue.json').read_text())
        ids = [c['id'] for c in catalogue]
        self.assertEqual(ids, ['ire', 'pxa', 'etf-pricing', 'algothon'])
        self.assertEqual(re.findall(r'<li[^>]*data-case-id="([^"]+)"', home), ids)
        self.assertEqual(re.findall(r'<tr[^>]*data-case-id="([^"]+)"', lab), ids)
        self.assertIn('<dt>Archives</dt><dd>4</dd>', lab)

    def test_profile_binds_each_statistic_to_its_comparator(self):
        page = (ROOT / 'profile.html').read_text()
        self.assertNotIn('3.7 points · 0.4 standard errors', page)
        self.assertIn('<p><span class="figure-value">3.7 points</span> behind second place.</p>', page)
        self.assertIn('About <span class="figure-value">0.4 of one block’s standard error</span> from the public-data replay mean.</p>', page)
        self.assertIn('1st of 253', page)
        self.assertIn('3rd in the Final round (1,085.17)', page)

if __name__ == '__main__':
    unittest.main(verbosity=2)
