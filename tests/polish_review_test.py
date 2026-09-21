"""Check decision/order consistency and committed PR output."""
import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/verify_publication.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class DecisionTraceTests(unittest.TestCase):
    def setUp(self):
        self.pack=json.loads((ROOT/'data/published-runs-historical.json').read_text())
        self.tapes=json.loads((ROOT/'data/historical-instruments.json').read_text())
        self.result=self.pack['markets']['historical']['runs'][0]['result']
        self.queued=next(i for i,d in enumerate(self.result['decisions']) if d[2]=='QUEUED')
    def verify(self):return audit.verify_market(self.pack,self.tapes,'historical')
    def test_original_decisions_match_reported_orders(self):self.assertEqual(self.verify()['runs'],12)
    def test_queued_target_above_limit_is_rejected(self):
        self.result['decisions'][self.queued][0]=101
        with self.assertRaises(ValueError):self.verify()
    def test_in_limit_target_must_match_order(self):
        self.result['decisions'][self.queued][0]=5
        with self.assertRaises(ValueError):self.verify()
    def test_hold_target_must_match_current_inventory(self):
        self.result['decisions'][0][0]=1
        with self.assertRaises(ValueError):self.verify()
    def test_filled_order_reason_must_match_queued_decision(self):
        self.result['orders'][0]['reason']='Unrelated rationale'
        with self.assertRaises(ValueError):self.verify()
    def test_queued_order_cannot_be_declared_as_hold(self):
        self.result['decisions'][self.queued][2]='HOLD'
        with self.assertRaises(ValueError):self.verify()
class CommittedOutputTests(unittest.TestCase):
    def test_pr_checks_validate_committed_generated_output(self):
        text=(ROOT/'.github/workflows/polish-assurance.yml').read_text()
        step=text.split('- name: Generate reviewed presentation only',1)[1].split('- name: All static and unit regressions',1)[0]
        self.assertIn('if [ "$EVENT_NAME" = "pull_request" ]; then',step)
        pr=step.split('then',1)[1].split('else',1)[0]
        self.assertIn('python scripts/apply_public_polish.py --check',pr)
        self.assertIn('git diff --exit-code',pr)
if __name__=='__main__':unittest.main(verbosity=2)
