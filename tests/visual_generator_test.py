"""Guard the reversible, presentation-only homepage enhancement."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
OLD_HEADING = '<h1 class="sr-only">Yiping Yin — quantitative research and trading</h1>'
FIXTURE = ('<!DOCTYPE html><html><head><title>Existing title</title></head>'
           '<body class="semicircle-study"><main id="main">' + OLD_HEADING +
           '<section id="about" class="hero terminal-hero">'
           '<script type="application/json" id="terminal-hero-data">{"preserved":true}</script>'
           '</section><section class="highlights-section">Awards unchanged</section>'
           '<section class="demo-featured-runs">All original results unchanged</section>'
           '</main></body></html>')

class VisualGenerator(unittest.TestCase):
    def load(self):
        path = ROOT / 'scripts/apply_public_visual.py'
        self.assertTrue(path.is_file(), 'The approved visual enhancement is not implemented yet')
        spec = importlib.util.spec_from_file_location('visual', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_visible_identity_and_two_real_links(self):
        module = self.load()
        result = module.transform_home(FIXTURE, '0123456789ab')
        self.assertIn('<h1 id="home-identity">Yiping Yin', result)
        self.assertIn('Quantitative research &amp; trading', result)
        self.assertIn('>Explore P.Book <span', result)
        self.assertIn('href="/training.html?market=historical#/training"', result)
        self.assertIn('href="/profile.html"', result)
        self.assertEqual(result.count('<h1 '), 1)
        self.assertLess(result.index('home-intro'), result.index('id="about"'))

    def test_no_existing_evidence_or_terminal_is_rewritten(self):
        module = self.load()
        result = module.transform_home(FIXTURE, '0123456789ab')
        self.assertEqual(module.restore_home(result), FIXTURE)

    def test_idempotent_and_cache_version_updates(self):
        module = self.load()
        first = module.transform_home(FIXTURE, '0123456789ab')
        self.assertEqual(module.transform_home(first, '0123456789ab'), first)
        second = module.transform_home(first, 'abcdef012345')
        self.assertIn('home-visual.css?v=abcdef012345', second)
        self.assertNotIn('home-visual.css?v=0123456789ab', second)
        self.assertEqual(module.restore_home(second), FIXTURE)

    def test_source_drift_is_rejected(self):
        module = self.load()
        for source in (FIXTURE.replace(OLD_HEADING, ''), FIXTURE.replace(OLD_HEADING, OLD_HEADING * 2),
                       FIXTURE.replace('semicircle-study', 'other-layout')):
            with self.subTest(source=source):
                with self.assertRaises(ValueError):
                    module.transform_home(source, '0123456789ab')

    def test_unsafe_css_version_is_rejected(self):
        module = self.load()
        with self.assertRaises(ValueError):
            module.transform_home(FIXTURE, '\"><script>')

    def test_visual_manifest_owns_only_its_new_stylesheet(self):
        module = self.load()
        # Existing generators refresh index.html in their own manifest groups.
        # Duplicating that digest in a new group breaks later catalogue edits.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'scripts').mkdir()
            (root / 'portfolio-assets').mkdir()
            (root / 'index.html').write_text(FIXTURE)
            (root / module.STYLE).write_text('/* candidate */')
            (root / module.VERIFIER).write_text('for group in ' + module.GROUPS + ':\n    pass\n')
            (root / 'release.json').write_text(json.dumps({'publicEnhancements': {'files': {'index.html': '0'*64}}}))
            module.apply(root)
            release = json.loads((root / 'release.json').read_text())
            self.assertEqual(set(release['publicVisual']['files']), {module.STYLE})

    def test_manifest_verifier_retains_previous_generator_anchors(self):
        module = self.load()
        source = "for group in ['publicEnhancements', 'publicP2', 'publicCopy', 'publicFourFixes', 'publicPolish', 'publicDemo']:\n    pass\n"
        result = module.transform_verifier(source)
        self.assertIn("'publicFourFixes', 'publicPolish', 'publicDemo']", result)
        self.assertIn("+ ['publicVisual']:", result)
        self.assertEqual(module.transform_verifier(result), result)

if __name__ == '__main__':
    unittest.main(verbosity=2)
