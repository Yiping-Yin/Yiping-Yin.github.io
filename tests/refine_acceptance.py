"""Refinement generation, evidence preservation and fail-closed checks."""
import hashlib,json,re,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from apply_public_refine import apply,MARKET,MARKET_SHA,OLD_EFFECT,NEW_EFFECT,derive_market
from verify_public_release import validate_manifests
class RefineAcceptance(unittest.TestCase):
    def test_all_generators_remain_current(self):
        for n in ('p1','p2','copy','four_fixes','polish','demo','quality','refine'):
            p=subprocess.run([sys.executable,str(ROOT/f'scripts/apply_public_{n}.py'),'--check'],capture_output=True,text=True)
            self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        files=validate_manifests(ROOT)
        for name in ('home-visual.css','home-refine.css','market-refine-v1.js'):
            self.assertIn('portfolio-assets/'+name,files)
    def test_only_replay_timer_effect_changes(self):
        before=(ROOT/MARKET).read_text();after=(ROOT/'portfolio-assets/market-refine-v1.js').read_text()
        self.assertEqual(after,derive_market(before))
        self.assertEqual(after.replace(NEW_EFFECT,OLD_EFFECT,1),before)
        self.assertEqual(hashlib.sha256(before.encode()).hexdigest(),MARKET_SHA)
    def test_exactly_one_identity_and_comparison(self):
        home=(ROOT/'index.html').read_text();profile=(ROOT/'profile.html').read_text()
        self.assertEqual(home.count('<h1 '),1);self.assertIn('<h1 id="home-identity">Yiping Yin',home)
        self.assertEqual(home.count('Explore P.Book'),1)
        self.assertEqual(profile.count('3.7 points'),1);self.assertEqual(profile.count('0.4 of one block'),1)
        self.assertIn('from the public-data replay mean.',profile)
        self.assertEqual(home.count('Watch replay'),3);self.assertEqual(home.count('Read report'),3)
        self.assertNotIn('<span>1 fills</span>',home)
    def test_every_published_run_remains_in_both_archive_tables(self):
        home=(ROOT/'index.html').read_text()
        for kind in ('historical','synthetic'):
            pack=json.loads((ROOT/f'data/published-runs-{kind}.json').read_text())
            for r in pack['markets'][kind]['runs']:
                self.assertEqual(home.count('data-p2-run="'+r['result']['runId']+'"'),2)
    def test_changed_input_fails_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'site';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('.git','qa','__pycache__'))
            p=root/MARKET;p.write_text(p.read_text()+'\n// mutation')
            def digests():return {p.relative_to(root):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
            before=digests()
            with self.assertRaisesRegex(ValueError,'Refinement input changed'):apply(root)
            self.assertEqual(before,digests())
if __name__=='__main__':unittest.main(verbosity=2)
