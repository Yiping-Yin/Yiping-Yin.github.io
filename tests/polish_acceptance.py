import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PolishAcceptance(unittest.TestCase):
 def test_terminal_separates_replay_from_completed_outcome(self):
  s=(ROOT/'index.html').read_text()
  for ident in ['p2-replay-at','p2-completed-outcome','p2-current-id']:self.assertTrue(f'id="{ident}"' in s,ident)
 def test_lab_starts_with_public_research(self):
  s=(ROOT/'lab.html').read_text();self.assertTrue('id="lab-featured-research"' in s);self.assertLess(s.index('id="lab-featured-research"'),s.index('id="lab-theory-h"'));self.assertFalse('Verified 14 Sep 2026' in s)
 def test_lab_boundaries_are_native_details(self):
  s=(ROOT/'lab.html').read_text();self.assertTrue('<details id="lab-publication-scope"' in s);self.assertTrue('human-approved handoff' in s)
 def test_ide_details_preserve_live_source_verdict(self):
  p=ROOT/'portfolio-assets/studio-details-v1.js';self.assertTrue(p.exists(),'Folded IDE module missing');s=p.read_text()
  for needle in ['polish-source-digest','polish-engine-details','ev-verdict','The source above has been edited.']:self.assertTrue(needle in s,needle)
 def test_ide_import_map_precedes_module_entry(self):
  s=(ROOT/'training.html').read_text();self.assertTrue('type="importmap"' in s);self.assertLess(s.index('type="importmap"'),s.index('type="module"'))
if __name__=='__main__':unittest.main(verbosity=2)
