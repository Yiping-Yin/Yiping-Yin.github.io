"""Generation and evidence invariants for the lightweight public demo."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from apply_public_demo import apply, derive_studio, derive_training, selected_runs
from verify_public_release import validate_manifests

class DemoAcceptance(unittest.TestCase):
    def test_three_examples_come_from_same_published_tape(self):
        text = (ROOT / 'index.html').read_text()
        for run in selected_runs(ROOT):
            ident = run['result']['runId']
            block = re.search(r'<article data-run-id="' + ident + r'">(.*?)</article>', text, re.S)[1]
            self.assertIn(f"{run['result']['metrics']['netPnl']:+.2f} USD", block)
            self.assertIn(f"{run['result']['metrics']['fillCount']} fills", block)
            self.assertIn('source=' + run['taskId'], block)
            self.assertIn('view=replay&amp;run=' + ident, block)
        self.assertIn('Selected by method, not by return.', text)
        self.assertEqual(text.count('<details class="s1-runs demo-archive" id="published-runs"'), 1)
        self.assertEqual(text.count('<details class="demo-run-rules">'), 1)

    def test_all_fifteen_records_are_still_in_both_archive_tables(self):
        text = (ROOT / 'index.html').read_text()
        for kind in ('historical', 'synthetic'):
            pack = json.loads((ROOT / f'data/published-runs-{kind}.json').read_text())
            for run in pack['markets'][kind]['runs']:
                self.assertEqual(text.count('data-p2-run="' + run['result']['runId'] + '"'), 2)

    def test_generated_modules_and_import_identity(self):
        for old, new, derive in [('training-copy-v1.js','training-demo-v1.js',derive_training),('studio-details-v1.js','studio-demo-v1.js',derive_studio)]:
            self.assertEqual((ROOT / 'portfolio-assets' / new).read_text(), derive((ROOT / 'portfolio-assets' / old).read_text()))
            subprocess.run(['node', '--check', str(ROOT / 'portfolio-assets' / new)], check=True, capture_output=True)
        page = (ROOT / 'training.html').read_text()
        imports = json.loads(re.search(r'<script type="importmap">(.*?)</script>', page)[1])['imports']
        entry = '/portfolio-assets/training-quality-v1.js' if 'public-quality:v1' in page else '/portfolio-assets/training-demo-v1.js'
        self.assertEqual(imports['/portfolio-assets/training-copy-v1.js'], entry)
        self.assertIn('crossorigin src="' + entry + '"', page)

    def test_generators_and_final_manifest_are_reproducible(self):
        for name in ('public_p1','public_p2','public_copy','public_four_fixes','public_polish','public_demo'):
            result = subprocess.run([sys.executable, str(ROOT / f'scripts/apply_{name}.py'), '--check'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        hashes = validate_manifests(ROOT)
        for name in ('demo.css','training-demo-v1.js','studio-demo-v1.js'):
            self.assertIn('portfolio-assets/' + name, hashes)

    def test_unreviewed_source_fails_before_any_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'site'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git','qa','__pycache__'))
            p = root / 'portfolio-assets/studio-details-v1.js'
            p.write_text(p.read_text() + '\n// changed input')
            before = {p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            with self.assertRaisesRegex(ValueError, 'Demo input changed'):
                apply(root)
            self.assertEqual(before, {p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()})

if __name__ == '__main__':
    unittest.main(verbosity=2)
