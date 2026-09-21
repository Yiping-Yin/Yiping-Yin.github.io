"""Guard reproducibility, shared counts, public boundaries and unchanged evidence."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from apply_public_four_fixes import apply, catalogue
from verify_public_release import declared_hashes, validate_manifests

class FourFixesGenerator(unittest.TestCase):
    def test_all_generators_are_idempotent(self):
        for name in ['apply_public_p1.py', 'apply_public_p2.py', 'apply_public_copy.py', 'apply_public_four_fixes.py']:
            result = subprocess.run([sys.executable, str(ROOT / 'scripts' / name), '--check'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_release_verifier_covers_the_new_stylesheet(self):
        hashes = validate_manifests(ROOT)
        self.assertIn('portfolio-assets/four-fixes.css', hashes)
        release = json.loads((ROOT / 'release.json').read_text())
        self.assertEqual(release['publicFourFixes']['catalogueSHA256'], hashlib.sha256((ROOT / 'scripts/public_case_catalogue.json').read_bytes()).hexdigest())

    def test_original_runtime_inputs_are_unchanged(self):
        config = json.loads((ROOT / 'scripts/presentation_copy.json').read_text())
        for name, sha in config['immutableInputs'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), sha, name)
        from apply_public_copy import derive_module
        for name, spec in config['modules'].items():
            self.assertEqual((ROOT / spec['output']).read_text(), derive_module(name, spec, config, ROOT))

    def test_one_catalogue_edit_updates_all_three_counts(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'site'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'qa', '__pycache__'))
            path = root / 'scripts/public_case_catalogue.json'
            cases = json.loads(path.read_text())
            cases.insert(0, {'id':'fixture-only', 'title':'Fixture <only>', 'subject':'Not a real project'})
            path.write_text(json.dumps(cases))
            apply(root)
            home, lab = (root / 'index.html').read_text(), (root / 'lab.html').read_text()
            self.assertIn('Case archives <span>5</span>', home)
            self.assertIn('4 methods · 5 cases', home)
            self.assertIn('<dt>Archives</dt><dd>5</dd>', lab)
            for page in [home, lab]:
                self.assertIn('Fixture &lt;only&gt;', page)
            self.assertEqual(apply(root, check=True), [])
            validate_manifests(root)

    def test_unreviewed_or_private_destinations_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'scripts').mkdir()
            cases = json.loads((ROOT / 'scripts/public_case_catalogue.json').read_text())
            cases[-1]['report'] = 'file:///private/research.pdf'
            (root / 'scripts/public_case_catalogue.json').write_text(json.dumps(cases))
            with self.assertRaisesRegex(ValueError, 'Unreviewed public case destination'):
                catalogue(root)

    def test_failed_source_match_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'site'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'qa', '__pycache__'))
            p = root / 'profile.html'
            p.write_text(p.read_text().replace('behind second place.</p>', 'unexpected comparator.</p>'))
            before = {p.relative_to(root):p.read_bytes() for p in root.rglob('*') if p.is_file()}
            with self.assertRaisesRegex(ValueError, 'source structure changed'):
                apply(root)
            self.assertEqual(before, {p.relative_to(root):p.read_bytes() for p in root.rglob('*') if p.is_file()})

if __name__ == '__main__':
    unittest.main(verbosity=2)
