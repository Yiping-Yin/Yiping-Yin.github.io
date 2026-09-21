"""Public P2 artifact contract; does not claim to test the private Python engine."""
import hashlib,json,re,subprocess,sys,unittest
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.ids=[];self.links=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if 'id' in d:self.ids.append(d['id'])
  if tag=='a' and 'href' in d:self.links.append(d['href'])
class Acceptance(unittest.TestCase):
 def test_case_has_evidence_and_explicit_sample_boundaries(self):
  p=ROOT/'research-algothon.html';self.assertTrue(p.exists(),'Curated case is required');s=p.read_text()
  for v in ['1,500','51','500','1,085.169047','984.62','1.14','166','predecessor','not a confidence interval','RESEARCH-NOTES.md','abc123.py','final2.py','Algothon-Research-Report.pdf']:self.assertIn(v,s)
  for k in ['question','data','method','results','limits','sources']:self.assertIn(k,Page(s).ids)
 def test_compare_page_has_accessible_controls_and_fallback(self):
  p=ROOT/'compare.html';self.assertTrue(p.exists(),'Comparison page required');s=p.read_text()
  for k in ['a-run','b-run','comparison-status','comparison-chart','minute','comparison-data','run-evidence']:self.assertIn(k,Page(s).ids)
  self.assertIn('<noscript>',s);self.assertIn('/#published-runs',Page(s).links);self.assertIn('B minus A',s)
 def test_case_is_reachable_from_related_project_entries(self):
  for name in ['index.html','profile.html','lab.html']:self.assertIn('/research-algothon.html',Page((ROOT/name).read_text()).links,name)
 def test_comparison_is_reachable_from_home_profile_lab(self):
  for name in ['index.html','profile.html','lab.html']:self.assertTrue(any(x.startswith('/compare.html') for x in Page((ROOT/name).read_text()).links),name)
 def test_all_home_run_links_have_explicit_identity(self):
  s=(ROOT/'index.html').read_text();self.assertEqual(len(re.findall(r'data-p2-run="[a-f0-9]{64}"',s)),30)
  self.assertIn('id="current-run"',s);self.assertIn('id="p2-run-map"',s)
  for k in ['p2-current-report','p2-current-replay','p2-current-source','p2-current-compare']:self.assertIn(k,Page(s).ids)
 def test_new_assets_present_and_html_ids_unique(self):
  for path in ['portfolio-assets/comparison-model.mjs','portfolio-assets/comparison-page.mjs','portfolio-assets/home-runs.mjs','portfolio-assets/p2.css']:self.assertTrue((ROOT/path).is_file(),path)
  for name in ['index.html','profile.html','lab.html','compare.html','research-algothon.html']:
   ids=Page((ROOT/name).read_text()).ids;self.assertEqual(len(ids),len(set(ids)),name)
 def test_new_pages_have_canonical_paths_and_sitemap(self):
  for name in ['compare.html','research-algothon.html']:
   self.assertTrue((ROOT/name).exists());url='https://yiping-yin.github.io/'+name
   self.assertIn(url,(ROOT/name).read_text());self.assertIn(url,(ROOT/'sitemap.xml').read_text())
 def test_historical_and_synthetic_payloads_are_unchanged(self):
  release=json.loads((ROOT/'release.json').read_text())
  for item in release['publishedRuns']['files']:
   self.assertEqual(hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest(),item['sha256'])
 def test_public_p2_manifest_matches_files(self):
  r=json.loads((ROOT/'release.json').read_text());self.assertIn('publicP2',r)
  self.assertEqual(set(r['publicP2']['scope']),{'P2-01','P2-02','P2-03'})
  for path,sha in r['publicP2']['files'].items():self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),sha,path)
 def test_p1_and_p2_generation_both_remain_idempotent(self):
  self.assertTrue((ROOT/'scripts/apply_public_p2.py').exists())
  for script in ['scripts/apply_public_p1.py','scripts/apply_public_p2.py']:
   result=subprocess.run([sys.executable,str(ROOT/script),'--check'],capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stdout+result.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
