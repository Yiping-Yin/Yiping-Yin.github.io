"""Polish derivation remains reproducible and refuses unknown upstream source."""
import hashlib,importlib.util,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PolishGenerator(unittest.TestCase):
 def test_all_generators_remain_idempotent(self):
  for name in ['public_p1','public_p2','public_copy','public_four_fixes','public_polish']:
   p=subprocess.run([sys.executable,str(ROOT/f'scripts/apply_{name}.py'),'--check'],capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stdout+p.stderr)
 def test_changed_studio_source_writes_nothing(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'site';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('qa','.git','__pycache__'))
   source=root/'portfolio-assets/studio-copy-v1.js';source.write_text(source.read_text()+'\n// unreviewed change')
   files=['index.html','lab.html','training.html','release.json'];before={n:(root/n).read_bytes() for n in files}
   p=subprocess.run([sys.executable,str(ROOT/'scripts/apply_public_polish.py'),'--root',str(root)],capture_output=True,text=True)
   self.assertNotEqual(p.returncode,0);self.assertIn('IDE source changed',p.stderr);self.assertEqual(before,{n:(root/n).read_bytes() for n in files})
if __name__=='__main__':unittest.main(verbosity=2)
