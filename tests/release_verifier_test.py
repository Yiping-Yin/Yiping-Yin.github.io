"""Offline regressions for the production verifier; no tokens or network needed."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/verify_public_release.py'
SHA = 'a' * 40

def module():
    assert SCRIPT.exists(), 'Reusable production verifier must exist'
    spec = importlib.util.spec_from_file_location('verifier', SCRIPT)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

def run(**changes):
    r = dict(id=2, head_sha=SHA, head_branch='main', event='dynamic',
             path='dynamic/pages/pages-build-deployment', status='completed',
             conclusion='success', run_attempt=1, html_url='https://github.com/example/run/2')
    return dict(r, **changes)

class VerifierTests(unittest.TestCase):
    def test_discovers_both_p2_pages_and_future_root_pages(self):
        m=module(); paths=m.public_paths(ROOT)
        self.assertIn('compare.html',paths); self.assertIn('research-algothon.html',paths)
        self.assertNotIn('UPGRADE_PLAN.md',paths)
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'future.html').write_text('new'); (p/'release.json').write_text('{}')
            self.assertIn('future.html',m.public_paths(p))
    def test_known_release_manifests_validate(self):
        m=module(); self.assertTrue(m.validate_manifests(ROOT))
    def test_changed_local_asset_is_rejected(self):
        m=module()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'index.html').write_text('changed')
            (p/'release.json').write_text(json.dumps({'publicEnhancements':{'files':{'index.html':'0'*64}}}))
            with self.assertRaisesRegex(ValueError,'digest'): m.validate_manifests(p)
    def test_unsafe_manifest_path_is_rejected(self):
        m=module()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'release.json').write_text(json.dumps({'publicEnhancements':{'files':{'../secret':'0'*64}}}))
            with self.assertRaises(ValueError): m.validate_manifests(p)
    def test_missing_manifest_file_is_rejected(self):
        m=module()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'release.json').write_text(json.dumps({'publicEnhancements':{'files':{'missing.html':'0'*64}}}))
            with self.assertRaises(ValueError): m.validate_manifests(p)
    def test_missing_enhancement_manifest_is_rejected(self):
        m=module()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); (p/'release.json').write_text('{}')
            with self.assertRaises(ValueError): m.validate_manifests(p)
    def test_duplicate_conflicting_hashes_are_rejected(self):
        m=module(); manifest=json.loads((ROOT/'release.json').read_text())
        manifest['publicP2']['files']['index.html']='0'*64
        with self.assertRaisesRegex(ValueError,'Conflicting'): m.declared_hashes(manifest)
    def test_exact_pages_run_is_selected_not_other_checks(self):
        m=module(); candidates=[run(id=9,path='.github/workflows/public-p2.yml',event='push'),run(id=2),run(id=8,head_sha='b'*40)]
        self.assertEqual(m.select_pages_run(candidates,SHA)['id'],2)
    def test_failed_newer_run_cannot_be_hidden_by_older_success(self):
        m=module(); r=m.select_pages_run([run(id=2),run(id=3,conclusion='failure')],SHA)
        self.assertEqual(r['conclusion'],'failure')
    def test_pending_rerun_is_not_completed_success(self):
        m=module(); r=m.select_pages_run([run(run_attempt=1),run(run_attempt=2,status='in_progress',conclusion=None)],SHA)
        self.assertEqual(r['status'],'in_progress')
    def test_wrong_sha_branch_or_workflow_cannot_match(self):
        m=module()
        for change in [dict(head_sha='b'*40),dict(head_branch='feature'),dict(path='other.yml')]:
            self.assertIsNone(m.select_pages_run([run(**change)],SHA))
    def test_wait_requires_success_for_exact_sha(self):
        m=module(); calls=[]
        def api(path):
            calls.append(path)
            if 'git/ref' in path:return {'object':{'sha':SHA}}
            return {'workflow_runs':[run()]}
        self.assertEqual(m.wait_for_pages('owner/repo',SHA,api=api)['id'],2)
        self.assertTrue(any('head_sha='+SHA in p for p in calls))
    def test_failed_deploy_stops_without_live_success(self):
        m=module()
        def api(path):return {'object':{'sha':SHA}} if 'git/ref' in path else {'workflow_runs':[run(conclusion='failure')]}
        with self.assertRaisesRegex(RuntimeError,'failure'):m.wait_for_pages('owner/repo',SHA,api=api)
    def test_superseded_commit_is_explicit(self):
        m=module()
        with self.assertRaises(m.Superseded):m.wait_for_pages('owner/repo',SHA,api=lambda p:{'object':{'sha':'b'*40}})
    def test_missing_pages_run_times_out(self):
        m=module()
        def api(path):return {'object':{'sha':SHA}} if 'git/ref' in path else {'workflow_runs':[]}
        with self.assertRaises(TimeoutError):m.wait_for_pages('owner/repo',SHA,api=api,timeout=0)
    def test_live_checks_use_ordinary_and_versioned_urls(self):
        m=module(); calls=[]
        def fetch(path,version):calls.append((path,version)); return (ROOT/path).read_bytes()
        results=m.verify_files(ROOT,SHA,fetcher=fetch,attempts=1)
        self.assertEqual(len(results),2*len(m.public_paths(ROOT)))
        self.assertTrue(all(r['matches'] for r in results))
        self.assertIn(('compare.html',False),calls); self.assertIn(('compare.html',True),calls)
    def test_stale_normal_url_cannot_pass_with_fresh_query_url(self):
        m=module()
        def fetch(path,version):return b'stale' if path=='compare.html' and not version else (ROOT/path).read_bytes()
        rows=m.verify_files(ROOT,SHA,fetcher=fetch,attempts=1)
        self.assertEqual([r['path'] for r in rows if not r['matches']],['compare.html'])
    def test_http_failure_is_reported_not_swallowed(self):
        m=module()
        def fetch(path,version):
            if path=='research-algothon.html':raise OSError('HTTP 503')
            return (ROOT/path).read_bytes()
        failures=[r for r in m.verify_files(ROOT,SHA,fetcher=fetch,attempts=1) if not r['matches']]
        self.assertEqual(len(failures),2); self.assertTrue(all('503' in r['error'] for r in failures))
    def test_retry_records_attempt_count_and_recovers(self):
        m=module(); calls={}
        def fetch(path,version):
            key=(path,version); calls[key]=calls.get(key,0)+1
            if path=='compare.html' and calls[key]==1:raise OSError('temporary')
            return (ROOT/path).read_bytes()
        rows=m.verify_files(ROOT,SHA,fetcher=fetch,attempts=2,delay=0)
        self.assertTrue(all(r['matches'] for r in rows));self.assertTrue(all(r['attempts']==2 for r in rows if r['path']=='compare.html'))
    def test_production_workflow_has_push_and_manual_read_only_triggers(self):
        path=ROOT/'.github/workflows/public-release-verification.yml'
        self.assertTrue(path.exists(),'Production verification workflow must exist')
        text=path.read_text();self.assertIn('push:',text);self.assertIn('workflow_dispatch:',text)
        self.assertNotIn('workflow_run:',text);self.assertNotIn(': write',text)
        self.assertIn('actions: read',text);self.assertIn('verify_public_release.py',text)
        self.assertIn('if: always()',text)
    def test_404_has_six_routes_and_no_brittle_page_count(self):
        text=(ROOT/'404.html').read_text()
        self.assertNotIn('Four pages',text)
        for path in ['/compare.html','/research-algothon.html']:self.assertIn('href="'+path+'"',text)

if __name__=='__main__': unittest.main(verbosity=2)
