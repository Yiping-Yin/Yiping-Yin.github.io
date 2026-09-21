"""Mutation tests for independent publication reconciliation."""
import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PublicationIntegrityTests(unittest.TestCase):
 def setUp(self):
  p=ROOT/'scripts/verify_publication.py';self.assertTrue(p.exists(),'Independent verifier missing');spec=importlib.util.spec_from_file_location('verify_publication',p);self.v=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.v)
  self.pack=json.loads((ROOT/'data/published-runs-historical.json').read_text());self.tapes=json.loads((ROOT/'data/historical-instruments.json').read_text());self.r=self.pack['markets']['historical']['runs'][0]['result']
 def check(self):return self.v.verify_market(self.pack,self.tapes,'historical')
 def test_original_published_ledgers_reconcile(self):self.assertEqual(self.check()['runs'],12)
 def test_source_hash_is_checked(self):
  self.pack['markets']['historical']['provenance']['strategies'][0]['code']+='\n# changed'
  with self.assertRaises(ValueError):self.check()
 def test_ohlc_order_is_checked(self):
  self.tapes['instruments'][0]['bars'][0][1]=1
  with self.assertRaises(ValueError):self.check()
 def test_wrong_price_path_is_rejected(self):
  self.r['equity'][25][3]+=1
  with self.assertRaises(ValueError):self.check()
 def test_intermediate_cash_is_checked(self):
  self.r['equity'][25][1]+=1
  with self.assertRaises(ValueError):self.check()
 def test_intermediate_equity_is_checked(self):
  self.r['equity'][25][0]+=1
  with self.assertRaises(ValueError):self.check()
 def test_fill_fee_is_checked(self):
  self.r['fills'][0]['fee']+=1
  with self.assertRaises(ValueError):self.check()
 def test_duplicate_fill_rejected(self):
  self.r['fills'].insert(0,copy.deepcopy(self.r['fills'][0]))
  with self.assertRaises(ValueError):self.check()
 def test_same_bar_fill_rejected(self):
  self.r['fills'][0]['decisionBarIndex']=self.r['fills'][0]['barIndex']
  with self.assertRaises(ValueError):self.check()
 def test_run_tape_identity_checked(self):
  self.r['datasetChecksum']='0'*64
  with self.assertRaises(ValueError):self.check()
 def test_nonfinite_quote_rejected(self):
  self.tapes['instruments'][0]['bars'][0][3]=float('nan')
  with self.assertRaises(ValueError):self.check()
 def test_synthetic_runs_are_independently_checked(self):
  pack=json.loads((ROOT/'data/published-runs-synthetic.json').read_text());tapes=json.loads((ROOT/'data/instruments.json').read_text());self.assertEqual(self.v.verify_market(pack,tapes,'synthetic')['runs'],3)
 def test_verification_does_not_edit_its_inputs(self):
  before=copy.deepcopy((self.pack,self.tapes));self.check();self.assertEqual(before,(self.pack,self.tapes))
if __name__=='__main__':unittest.main(verbosity=2)
