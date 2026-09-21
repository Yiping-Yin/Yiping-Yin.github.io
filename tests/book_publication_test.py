"""A quote-strategy export is evidence, not a newly executed strategy."""
import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/verify_publication.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class BookPublication(unittest.TestCase):
 def setUp(self):
  self.pack=json.loads((ROOT/'data/published-runs-synthetic.json').read_text());self.tapes=json.loads((ROOT/'data/instruments.json').read_text());self.book=self.pack['markets']['synthetic']['book'];self.w=self.book['trials']['entries'][0]['workspace']
 def verify(self):return audit.verify_market(self.pack,self.tapes,'synthetic')
 def test_book_fills_are_reconciled(self):self.assertEqual(self.verify().get('bookFillsReconciled'),87)
 def test_changed_book_source_rejected(self):
  self.w['strategy']['code']+='\n# edited'
  with self.assertRaises(ValueError):self.verify()
 def test_changed_book_cash_rejected(self):
  self.w['session']['fills'][0]['cashAfter']+=1
  with self.assertRaises(ValueError):self.verify()
 def test_changed_book_final_summary_rejected(self):
  self.book['summary']['endEquity']+=1
  with self.assertRaises(ValueError):self.verify()
 def test_changed_book_limit_rejected(self):
  self.w['session']['orders'][0]['limitPrice']=0
  with self.assertRaises(ValueError):self.verify()
if __name__=='__main__':unittest.main(verbosity=2)
