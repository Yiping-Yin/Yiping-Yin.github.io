"""Execute the workflow's actual cleanup-only guard against a real Git fixture."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/public-clean.yml'
BASELINE = 'db4c7e336231c86d3dc564527d8fdf7af24200ee'
CLEANUP_BRANCH = 'fix/clean-presentation-20260922'


class CleanupWorkflowScope(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Workflow test')
        self.git('config', 'user.email', 'test@example.invalid')
        for path in ('assets/example.js', 'data/example.json'):
            file = self.repo / path
            file.parent.mkdir(exist_ok=True)
            file.write_text('original\n', encoding='utf-8')
        self.git('add', '.')
        self.git('commit', '-qm', 'Original public assets')
        self.base = self.git('rev-parse', 'HEAD').stdout.strip()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.repo, text=True,
                              capture_output=True, check=True)

    def guard(self, branch, changed=None):
        if changed:
            (self.repo / changed).write_text('updated\n', encoding='utf-8')
            self.git('add', '.')
            self.git('commit', '-qm', 'Legitimate future change')
        text = WORKFLOW.read_text(encoding='utf-8')
        marker = '          if [ "$EVENT_NAME" = pull_request ]; then git diff --exit-code; fi\n'
        self.assertEqual(text.count(marker), 1)
        shell = textwrap.dedent(text.split(marker, 1)[1].split('\n      - name:', 1)[0])
        self.assertIn('git diff --exit-code ' + BASELINE, shell)
        shell = shell.replace(BASELINE, self.base)
        return subprocess.run(['bash', '-euc', shell], cwd=self.repo,
                              env={**os.environ, 'SOURCE_BRANCH': branch},
                              capture_output=True, text=True)

    def test_cleanup_preserves_unchanged_assets(self):
        result = self.guard(CLEANUP_BRANCH)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_cleanup_still_rejects_asset_changes(self):
        result = self.guard(CLEANUP_BRANCH, 'assets/example.js')
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('assets/example.js', result.stdout)

    def test_cleanup_still_rejects_data_changes(self):
        result = self.guard(CLEANUP_BRANCH, 'data/example.json')
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn('data/example.json', result.stdout)

    def test_future_asset_pr_is_not_frozen_to_cleanup_baseline(self):
        result = self.guard('feature/refresh-runtime', 'assets/example.js')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_future_data_pr_is_not_frozen_to_cleanup_baseline(self):
        result = self.guard('feature/refresh-tapes', 'data/example.json')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_branch_context_is_passed_as_data(self):
        text = WORKFLOW.read_text(encoding='utf-8')
        step = text.split('      - name: Assemble candidate or check committed PR files\n', 1)[1]
        step = step.split('\n      - name:', 1)[0]
        self.assertRegex(step, r'SOURCE_BRANCH:\s*\$\{\{ github\.head_ref \|\| github\.ref_name \}\}')
        run = step.split('        run: |\n', 1)[1]
        self.assertNotIn('${{', run)


if __name__ == '__main__':
    unittest.main(verbosity=2)
