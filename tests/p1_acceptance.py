"""P1 acceptance checks for the published static website (standard library only)."""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
REPORT = 'https://github.com/Yiping-Yin/algothon-2026/blob/main/Algothon-Research-Report.pdf'
CODE = 'https://github.com/Yiping-Yin/algothon-2026'
PROJECTS = ['algothon', 'market-making', 'etf-pricing', 'pbook', 'explaining-markets',
            'signal-mosaic', 'financial-agents', 'agent-society', 'latent-agent', 'pittsai']
RUN = '3df0ac0f357353bac0e991eed16d3f78458611ddf2f541cfdf44d7839529b1b2'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids, self.links, self.scripts = [], [], []
        self.feed(text)
    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        if 'id' in a: self.ids.append(a['id'])
        if tag == 'a' and 'href' in a: self.links.append(a['href'])
        if tag == 'script' and 'src' in a: self.scripts.append(a['src'])

class P1Acceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = {p: (ROOT / p).read_text() for p in ['index.html', 'profile.html', 'lab.html', 'training.html']}
        cls.pages = {p: Page(t) for p, t in cls.text.items()}

    def test_home_archive_has_direct_public_report_and_code(self):
        m = re.search(r'<li[^>]*id="lab-archive-algothon".*?</li>', self.text['index.html'], re.S)
        self.assertIsNotNone(m, 'Algothon homepage archive must contain its own evidence links')
        p = Page(m.group())
        self.assertIn(REPORT, p.links)
        self.assertIn(CODE, p.links)
        self.assertNotIn('Sealed archive', m.group())

    def test_lab_archive_has_the_same_direct_public_materials(self):
        m = re.search(r'<tr[^>]*id="archive-algothon".*?</tr>', self.text['lab.html'], re.S)
        self.assertIsNotNone(m, 'Algothon Lab archive row must contain evidence links')
        self.assertEqual(set(Page(m.group()).links), {REPORT, CODE})
        self.assertIn('Public', m.group())

    def test_all_profile_projects_have_stable_unique_anchors(self):
        for project in PROJECTS:
            self.assertEqual(self.pages['profile.html'].ids.count('project-' + project), 1, project)

    def test_old_profile_bookmarks_remain(self):
        for anchor in ['research', 'work', 'ai', 'agents', 'education', 'awards', 'skills', 'contact']:
            self.assertIn(anchor, self.pages['profile.html'].ids)

    def test_pbook_context_is_historical_and_links_to_report_replay_runs(self):
        m = re.search(r'<details[^>]*id="project-pbook".*?</details>', self.text['profile.html'], re.S)
        self.assertIsNotNone(m)
        urls = Page(m.group()).links
        self.assertIn('/#published-runs', urls)
        self.assertIn('/training.html?market=historical#/market', urls)
        for view in ['review', 'replay']:
            self.assertIn('/training.html?market=historical#/market?view=' + view + '&run=' + RUN, urls)
        self.assertNotIn('/training.html#/market', urls)

    def test_lab_run_context_is_not_synthetic_by_default(self):
        self.assertIn('/#published-runs', self.pages['lab.html'].links)
        self.assertIn('/training.html?market=historical#/market?view=review&run=' + RUN, self.pages['lab.html'].links)

    def test_run_anchor_and_source_export_are_integrated(self):
        self.assertIn('published-runs', self.pages['index.html'].ids)
        self.assertIn('/portfolio-assets/source-export.mjs?v=p1-1', self.pages['training.html'].scripts)

    def test_new_assets_exist(self):
        self.assertTrue((ROOT/'portfolio-assets/source-export.mjs').is_file())
        self.assertTrue((ROOT/'portfolio-assets/p1-evidence.css').is_file())

    def test_all_page_ids_remain_unique(self):
        for name, p in self.pages.items():
            self.assertEqual(len(p.ids), len(set(p.ids)), name)

    def test_canonical_pages_are_preserved(self):
        for name, text in self.text.items():
            path = '' if name == 'index.html' else name
            self.assertIn('https://yiping-yin.github.io/' + path, text)

    def test_opaque_run_reference_exists_in_real_published_payload(self):
        payload = (ROOT/'data/published-runs-historical.json').read_text()
        self.assertIn(RUN, payload)

    def test_private_research_is_not_linked(self):
        for name in ['index.html', 'lab.html']:
            for href in self.pages[name].links:
                self.assertNotIn('PBOOK_LAB_DIR', href)
                self.assertNotIn('/api/lab', href)
                self.assertNotIn('file://', href)

if __name__ == '__main__': unittest.main(verbosity=2)
