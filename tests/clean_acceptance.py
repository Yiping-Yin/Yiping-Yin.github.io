"""User-requested presentation cleanup; assert rendered source, not CSS concealment."""
import hashlib
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ('index.html', 'profile.html', 'lab.html', 'training.html')
class CleanAcceptance(unittest.TestCase):
    def test_static_explanations_and_empty_footer_are_removed(self):
        for name in PAGES:
            text = (ROOT/name).read_text()
            self.assertNotIn('<details class="copy-details"', text, name)
            self.assertNotIn('Data &amp; simulation details', text, name)
            self.assertNotIn('prices · Simulated trading</p>', text, name)
            self.assertNotIn('copy-site-notes"', text, name)
        self.assertNotIn('<div class="s1-foot">', (ROOT/'index.html').read_text())
    def test_table_headers_do_not_expose_hash_symbols(self):
        self.assertNotRegex((ROOT/'lab.html').read_text(), r'<th[^>]*>\s*#\s*</th>')
        for name in ('training-quality-v1.js', 'review-quality-v1.js'):
            self.assertNotIn('children:"#"', (ROOT/'portfolio-assets'/name).read_text(), name)
    def test_runtime_disclosure_components_are_removed(self):
        training = (ROOT/'portfolio-assets/training-quality-v1.js').read_text()
        review = (ROOT/'portfolio-assets/review-quality-v1.js').read_text()
        studio = (ROOT/'portfolio-assets/studio-demo-v1.js').read_text()
        self.assertNotIn('className:"d-say"', training)
        self.assertNotIn('className:"d-say-phone"', training)
        self.assertNotIn('Data & simulation details', review)
        self.assertNotIn('className:"rr-truth"', review)
        self.assertNotIn('"data-copy-register":"BOTH",children:A', studio)
    def test_changed_entry_and_imports_share_one_versioned_runtime(self):
        text = (ROOT/'training.html').read_text()
        imports = json.loads(re.search(r'<script type="importmap">(.*?)</script>', text)[1])['imports']
        entry = '/portfolio-assets/training-quality-v1.js?v=detail-1'
        self.assertIn('crossorigin src="'+entry+'"', text)
        for name in ('training-copy-v1.js', 'training-demo-v1.js', 'training-quality-v1.js'):
            self.assertEqual(imports['/portfolio-assets/'+name], entry)
        for name in ('review-copy-v1.js','review-quality-v1.js'):
            self.assertEqual(imports['/portfolio-assets/'+name], '/portfolio-assets/review-quality-v1.js?v=clean-1')
    def test_reference_remains_in_repository(self):
        text = (ROOT/'README.md').read_text()
        self.assertIn('Data and runtime reference', text)
        for phrase in ('390 one-minute bars','No live market connection or real orders.', 'Python execution requires the local P.Book runtime.'):
            self.assertIn(phrase, text)
    def test_rejected_design_is_not_imported(self):
        for name in PAGES:
            text = (ROOT/name).read_text()
            for phrase in ('blue-white-home','home-visual.css','public-refine:v1','home-intro'):
                self.assertNotIn(phrase, text)
    def test_original_exported_inputs_are_unchanged(self):
        manifest = json.loads((ROOT/'scripts/presentation_copy.json').read_text())
        for name, sha in manifest['immutableInputs'].items():
            self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(), sha, name)

if __name__ == '__main__':
    if os.environ.get('CLEAN_BASELINE') == '1':
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(CleanAcceptance))
        expected = {'test_static_explanations_and_empty_footer_are_removed', 'test_table_headers_do_not_expose_hash_symbols',
                    'test_runtime_disclosure_components_are_removed', 'test_changed_entry_and_imports_share_one_versioned_runtime',
                    'test_reference_remains_in_repository'}
        observed = {test._testMethodName for test, _ in result.failures}
        raise SystemExit(0 if observed == expected and not result.errors else 1)
    unittest.main(verbosity=2)
