"""Detail polish contracts, separate from the original display-cleanup tests."""
import hashlib
import json
import re
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from apply_public_demo import featured_html, selected_runs

class DetailAcceptance(unittest.TestCase):
    def test_featured_actions_and_singular_fill_counts(self):
        text = featured_html(selected_runs(ROOT))
        self.assertNotIn('1 fills', text)
        self.assertEqual(text.count('>Watch replay</a>'), 3)
        self.assertEqual(text.count('>View source</a>'), 3)
        self.assertEqual(text.count('>Read report</a>'), 3)
        for count, word in ((0, 'fills'), (1, 'fill'), (2, 'fills')):
            runs = selected_runs(ROOT)
            runs[0]['result']['metrics']['fillCount'] = count
            block = featured_html(runs).split('</article>')[0]
            self.assertIn(f'<span>{count} {word}</span>', block)
    def test_profile_evaluation_is_not_repeated_in_the_synopsis(self):
        text = (ROOT / 'profile.html').read_text()
        part = re.search(r'<article[^>]+id="project-algothon".*?</article>', text, re.S)[0]
        intro = re.search(r'<p class="feature-description">(.*?)</p>', part, re.S)[1]
        self.assertNotIn('3.7 points', intro)
        self.assertNotIn('0.4 of one block', intro)
        self.assertEqual(part.count('3.7 points'), 1)
        self.assertEqual(part.count('0.4 of one block'), 1)
        self.assertIn('54.07%', intro)
        self.assertIn('Method · evidence limits', part)
    def test_both_playback_controllers_bind_page_lifecycle(self):
        for name in ('training-quality-v1.js', 'market-quality-v1.js'):
            source = (ROOT / 'portfolio-assets' / name).read_text()
            self.assertIn('pauseWhenHidden', source, name)
            self.assertIn('if(!document.hidden)', source, name)
    def test_changed_assets_are_versioned_and_one_runtime_is_retained(self):
        page = (ROOT / 'training.html').read_text()
        imports = json.loads(re.search(r'<script type="importmap">(.*?)</script>', page)[1])['imports']
        entry = '/portfolio-assets/training-quality-v1.js?v=detail-1'
        self.assertIn('crossorigin src="' + entry + '"', page)
        for alias in ('training-copy-v1.js', 'training-demo-v1.js', 'training-quality-v1.js'):
            self.assertEqual(imports['/portfolio-assets/'+alias], entry)
        for alias in ('market-copy-v1.js', 'market-quality-v1.js'):
            self.assertEqual(imports['/portfolio-assets/'+alias], '/portfolio-assets/market-quality-v1.js?v=detail-1')
        for name in ('index.html','profile.html','lab.html','training.html'):
            self.assertIn('/portfolio-assets/clean.css?v=detail-1', (ROOT/name).read_text())
    def test_original_assets_and_published_records_are_unchanged(self):
        inputs = json.loads((ROOT/'scripts/presentation_copy.json').read_text())['immutableInputs']
        for name, sha in inputs.items():
            self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(), sha, name)

if __name__ == '__main__': unittest.main(verbosity=2)
