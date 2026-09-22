"""Generation, manifest and provenance checks for the four approved quality fixes."""
import hashlib,json,re,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from apply_public_quality import apply,INPUTS
from verify_public_release import validate_manifests
class QualityAcceptance(unittest.TestCase):
    def test_all_generators_and_manifests_are_current(self):
        for name in ('p1','p2','copy','four_fixes','polish','demo','quality'):
            result=subprocess.run([sys.executable,str(ROOT/f'scripts/apply_public_{name}.py'),'--check'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        hashes=validate_manifests(ROOT)
        self.assertTrue(all('portfolio-assets/'+name in hashes for name in ('quality-ui.mjs','quality-model.mjs','quality.css','training-quality-v1.js','review-quality-v1.js','market-quality-v1.js')))
    def test_retained_inputs_and_data_are_byte_identical(self):
        inputs=json.loads((ROOT/'scripts/presentation_copy.json').read_text())['immutableInputs']
        for name,digest in {**inputs,**INPUTS}.items():self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),digest,name)
    def test_one_runtime_for_all_import_aliases(self):
        text=(ROOT/'training.html').read_text();imports=json.loads(re.search(r'<script type="importmap">(.*?)</script>',text)[1])['imports']
        for name in ('training-copy-v1.js','training-demo-v1.js'):self.assertEqual(imports['/portfolio-assets/'+name],'/portfolio-assets/training-quality-v1.js')
        self.assertIn('crossorigin src="/portfolio-assets/training-quality-v1.js"',text)
        for view in ('review','market'):
            variant='refine' if view=='market' and 'public-refine:v1' in text else 'quality'
            self.assertEqual(imports[f'/portfolio-assets/{view}-copy-v1.js'],f'/portfolio-assets/{view}-{variant}-v1.js')
    def test_general_links_and_names_do_not_keep_old_labels(self):
        for p in ROOT.glob('*.html'):self.assertNotRegex(p.read_text(),r'href="/training\.html#/(market|training|studio)"',p.name)
        for name in ('training','review','market'):
            text=(ROOT/f'portfolio-assets/{name}-quality-v1.js').read_text();self.assertNotRegex(text,r'\bIDE\b')
            subprocess.run(['node','--check',str(ROOT/f'portfolio-assets/{name}-quality-v1.js')],check=True,capture_output=True)
    def test_changed_source_fails_before_any_output_is_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'site';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('.git','qa','__pycache__'))
            p=root/'portfolio-assets/review-copy-v1.js';p.write_text(p.read_text()+'\n// changed')
            before={p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            with self.assertRaisesRegex(ValueError,'Quality input changed'):apply(root)
            self.assertEqual(before,{p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()})
if __name__=='__main__':unittest.main(verbosity=2)
