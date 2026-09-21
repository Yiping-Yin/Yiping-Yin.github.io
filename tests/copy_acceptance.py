"""Presentation copy contracts; the original engine/data files are immutable inputs."""
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_data(self,data): self.parts.append(data)

def text(html):
    parser=Text(); parser.feed(html); return ' '.join(parser.parts)

class CopyAcceptance(unittest.TestCase):
    def test_home_primary_disclosure_is_short(self):
        page=(ROOT/'index.html').read_text()
        self.assertIn('class="th-say th-say-wide">Historical prices · Simulated trading</p>',page)
        self.assertNotIn('Not live · Not advice',page)
    def test_static_pages_have_keyboard_native_details(self):
        for name in ['index.html','profile.html','lab.html','training.html']:
            page=(ROOT/name).read_text()
            self.assertIn('<summary>Data &amp; simulation details</summary>',page,name)
            self.assertIn('No live market connection or real orders.',page,name)
            self.assertNotIn('synthetic Optibook tapes',page,name)
    def test_training_describes_local_execution_without_execution_claim(self):
        page=(ROOT/'training.html').read_text()
        self.assertIn('an interactive trading simulator',page)
        self.assertIn('Python execution requires the local P.Book runtime.',page)
        self.assertIn('not investment advice',page)
        self.assertIn('390 one-minute bars',page)
    def test_research_and_numeric_qualifications_stay(self):
        page=(ROOT/'research-algothon.html').read_text()
        for value in ['not a confidence interval','not an investment return','500-day window','1,085.169047']:
            self.assertIn(value,page)
        self.assertIn('One retained session is not evidence of persistent outperformance', (ROOT/'compare.html').read_text())
    def test_profile_still_labels_actual_optibook_project_simulation(self):
        page=(ROOT/'profile.html').read_text()
        self.assertIn('one-hour Optibook simulation',page)
        self.assertIn('1,222 lots',page)
    def test_training_notes_use_desk_theme(self):
        page=(ROOT/'training.html').read_text()
        self.assertIn('<footer class="pt-desk copy-site-notes"',page)
    def test_original_inputs_and_data_have_not_changed(self):
        manifest=ROOT/'scripts/presentation_copy.json'
        self.assertTrue(manifest.exists(),'Reviewed copy map is missing')
        config=json.loads(manifest.read_text())
        for path,sha in config['immutableInputs'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),sha,path)
    def test_generated_modules_only_contain_reviewed_changes(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        import apply_public_copy as copy
        config=json.loads((ROOT/'scripts/presentation_copy.json').read_text())
        for path,spec in config['modules'].items():
            expected=copy.derive_module(path,spec,config,ROOT)
            self.assertEqual((ROOT/spec['output']).read_text(),expected)
            subprocess.run(['node','--check',str(ROOT/spec['output'])],check=True,capture_output=True)
    def test_manifest_records_all_copy_files(self):
        release=json.loads((ROOT/'release.json').read_text())
        self.assertIn('publicCopy',release)
        for path,sha in release['publicCopy']['files'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),sha,path)
    def test_verifier_checks_copy_manifest(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        from verify_public_release import declared_hashes
        release=json.loads((ROOT/'release.json').read_text())
        hashes=declared_hashes(release)
        self.assertIn('portfolio-assets/training-copy-v1.js',hashes)
    def test_upstream_bundle_changes_fail_closed(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        import apply_public_copy as copy
        import tempfile
        config=json.loads((ROOT/'scripts/presentation_copy.json').read_text())
        path,spec=next(iter(config['modules'].items()))
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/path).parent.mkdir(parents=True)
            (root/path).write_text('unreviewed export')
            with self.assertRaisesRegex(ValueError,'Upstream bundle changed'):
                copy.derive_module(path,spec,config,root)
    def test_all_generators_stay_idempotent(self):
        for script in ['apply_public_p1.py','apply_public_p2.py','apply_public_copy.py']:
            result=subprocess.run([sys.executable,str(ROOT/'scripts'/script),'--check'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__': unittest.main(verbosity=2)
