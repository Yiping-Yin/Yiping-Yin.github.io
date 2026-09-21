"""Check the real source boundary and manifest, not a rewritten data fixture."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = '083ca17d29df1565ef48cdf5778de5e9e08714ed'
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class VisualAcceptance(unittest.TestCase):
    def test_home_evidence_remains_byte_exact(self):
        visual = load('visual', 'scripts/apply_public_visual.py')
        before = subprocess.check_output(['git', 'show', BASE + ':index.html'], cwd=ROOT).decode()
        after = (ROOT / 'index.html').read_text()
        self.assertEqual(visual.restore_home(after), before)
        self.assertIn('Historical prices · Simulated trading', after)
        self.assertEqual(after.count('class="demo-featured-runs"'), 1)
        self.assertIn('View all 15 published runs', after)

    def test_enhancement_and_all_manifests_are_current(self):
        visual = load('visual', 'scripts/apply_public_visual.py')
        self.assertEqual(visual.apply(ROOT, check=True), [])
        verifier = load('release_verifier', 'scripts/verify_public_release.py')
        hashes = verifier.validate_manifests(ROOT)
        self.assertIn('portfolio-assets/home-visual.css', hashes)
        release = json.loads((ROOT / 'release.json').read_text())
        before = json.loads(subprocess.check_output(['git', 'show', BASE + ':release.json'], cwd=ROOT))
        for key in ('hero', 'publishedRuns', 'capabilities', 'instruments', 'sourceSHA256', 'publishedAt'):
            self.assertEqual(release[key], before[key], key)

    def test_original_runtime_and_support_pages_are_untouched(self):
        paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE], cwd=ROOT, text=True).splitlines()
        protected = [p for p in paths if p.startswith(('assets/', 'data/')) or p in (
            'profile.html', 'training.html', 'lab.html', 'compare.html', 'research-algothon.html',
            'portfolio-assets/terminal-hero.js', 'portfolio-assets/terminal-hero.css',
            'portfolio-assets/tokens.css', 'portfolio-assets/site.css')]
        for name in protected:
            with self.subTest(path=name):
                before = subprocess.check_output(['git', 'show', BASE + ':' + name], cwd=ROOT)
                self.assertEqual(hashlib.sha256(before).digest(), hashlib.sha256((ROOT / name).read_bytes()).digest())

if __name__ == '__main__':
    unittest.main(verbosity=2)
