"""Read-only verification of the exact GitHub Pages commit and its public bytes."""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlencode

ORIGIN = 'https://yiping-yin.github.io/'
PAGES_PATH = 'dynamic/pages/pages-build-deployment'

class Superseded(RuntimeError):
    """A newer main commit replaced the version being checked; never call it passed."""


def safe_file(root: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid public file path')
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name:
        raise ValueError('Unsafe public file path: ' + name)
    target = root / name
    if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink() or not target.is_file():
        raise ValueError('Missing or unsafe public file: ' + name)
    return target


def declared_hashes(release: dict) -> dict[str, str]:
    if not release.get('publicEnhancements', {}).get('files'):
        raise ValueError('Public enhancement manifest is missing')
    hashes = {}
    for group in ['publicEnhancements', 'publicP2']:
        for name, digest in release.get(group, {}).get('files', {}).items():
            if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
                raise ValueError('Invalid declared digest: ' + str(name))
            if name in hashes and hashes[name] != digest:
                raise ValueError('Conflicting declared digests: ' + name)
            hashes[name] = digest
    for record in release.get('publishedRuns', {}).get('files', []):
        name, digest = record['path'], record['sha256']
        if name in hashes and hashes[name] != digest:
            raise ValueError('Conflicting declared digests: ' + name)
        hashes[name] = digest
    return hashes


def validate_manifests(root: Path) -> dict[str, str]:
    release = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    hashes = declared_hashes(release)
    for name, expected in hashes.items():
        if hashlib.sha256(safe_file(root, name).read_bytes()).hexdigest() != expected:
            raise ValueError('Local file digest differs from release.json: ' + name)
    for record in release.get('publishedRuns', {}).get('files', []):
        if safe_file(root, record['path']).stat().st_size != record['bytes']:
            raise ValueError('Published payload size differs: ' + record['path'])
    return hashes


def public_paths(root: Path) -> list[str]:
    # Discover future root pages instead of maintaining a four-page allowlist.
    paths = {p.name for p in root.glob('*.html')}
    paths.update(n for n in ['release.json', 'robots.txt', 'sitemap.xml', 'favicon.ico'] if (root/n).is_file())
    for folder in ['assets', 'portfolio-assets', 'data']:
        paths.update(p.relative_to(root).as_posix() for p in (root/folder).rglob('*') if p.is_file())
    for name in paths:
        safe_file(root, name)
    return sorted(paths)


def api_json(path: str) -> dict:
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'public-release-verifier'}
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('https://api.github.com/repos/' + path, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def select_pages_run(runs: list[dict], sha: str) -> dict | None:
    candidates = [r for r in runs if r.get('head_sha') == sha and r.get('head_branch') == 'main'
                  and r.get('path') == PAGES_PATH and r.get('event') == 'dynamic']
    return max(candidates, key=lambda r: (r['id'], r.get('run_attempt', 1)), default=None)


def assert_current(repo: str, sha: str, api=api_json) -> None:
    current = api(repo + '/git/ref/heads/main')['object']['sha']
    if current != sha:
        raise Superseded('Main changed during verification; this commit is superseded, not verified.')


def wait_for_pages(repo: str, sha: str, *, api=api_json, timeout=360, interval=5) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        assert_current(repo, sha, api)
        query = urlencode({'head_sha': sha, 'per_page': 100})
        run = select_pages_run(api(repo + '/actions/runs?' + query)['workflow_runs'], sha)
        if run and run['status'] == 'completed':
            if run.get('conclusion') != 'success':
                raise RuntimeError('Exact Pages deployment ended with ' + str(run.get('conclusion')))
            return run
        if time.monotonic() >= deadline:
            raise TimeoutError('No successful Pages deployment for the exact commit before timeout')
        time.sleep(interval)


def fetch_public(path: str, sha: str, versioned: bool) -> bytes:
    # The GitHub token is deliberately never sent to the public site.
    url = ORIGIN + quote(path, safe='/')
    if versioned:
        url += '?' + urlencode({'release-check': sha})
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise ValueError('HTTP ' + str(response.status))
        return response.read()


def verify_files(root: Path, sha: str, *, fetcher=None, attempts=3, delay=3) -> list[dict]:
    if fetcher is None:
        fetcher = lambda path, versioned: fetch_public(path, sha, versioned)
    paths = public_paths(root)
    def check(pair):
        path, versioned = pair
        expected = hashlib.sha256(safe_file(root, path).read_bytes()).hexdigest()
        for attempt in range(1, attempts + 1):
            record = dict(path=path, variant='versioned' if versioned else 'ordinary',
                          expected=expected, attempts=attempt, matches=False)
            try:
                content = fetcher(path, versioned)
                digest = hashlib.sha256(content).hexdigest()
                record.update(http=200, sha256=digest, bytes=len(content), matches=digest == expected)
                if record['matches']:
                    return record
            except Exception as error:
                record['error'] = str(error)
            if attempt < attempts:
                time.sleep(delay)
        return record
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(check, [(p, v) for p in paths for v in [False, True]]))


def wait_for_manifest(root: Path, sha: str, attempts=18, interval=5) -> None:
    expected = (root / 'release.json').read_bytes()
    error = 'Published release manifest has not converged'
    for attempt in range(attempts):
        try:
            if all(fetch_public('release.json', sha, v) == expected for v in [False, True]):
                return
        except Exception as exc:
            error = str(exc)
        if attempt + 1 < attempts:
            time.sleep(interval)
    raise RuntimeError(error)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--sha', required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--output', type=Path, default=Path('qa/live-release-verification.json'))
    args = parser.parse_args()
    report = {'commit': args.sha, 'origin': ORIGIN, 'status': 'failed', 'files': []}
    code = 1
    try:
        if not re.fullmatch(r'[a-f0-9]{40}', args.sha) or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
            raise ValueError('A full commit SHA and owner/repository are required')
        root = args.root.resolve()
        actual = subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'], text=True).strip()
        if actual != args.sha:
            raise ValueError('Checkout is not the exact commit requested for verification')
        manifest = validate_manifests(root)
        missing = set(manifest) - set(public_paths(root))
        if missing:
            raise ValueError('Declared public files are not covered: ' + ', '.join(sorted(missing)))
        deployed = wait_for_pages(args.repository, args.sha)
        report['pagesRun'] = {'id': deployed['id'], 'attempt': deployed.get('run_attempt', 1), 'url': deployed['html_url']}
        wait_for_manifest(root, args.sha)
        report['files'] = verify_files(root, args.sha)
        assert_current(args.repository, args.sha)
        report['applicationFiles'] = len(public_paths(root))
        report['requests'] = len(report['files'])
        report['failed'] = sum(not f['matches'] for f in report['files'])
        if report['failed']:
            raise RuntimeError('Published files differ from the deployed commit or are unavailable')
        report['status'] = 'passed'; code = 0
    except Superseded as error:
        report['status'] = 'superseded'; report['error'] = str(error); code = 3
    except Exception as error:
        report['error'] = str(error)
    finally:
        report['checkedAt'] = datetime.now(timezone.utc).isoformat()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        summary = f"## Published website verification: {report['status']}\n\nCommit: `{args.sha}`\n\n"
        summary += f"Files: {report.get('applicationFiles', 0)}; requests: {len(report['files'])}; mismatches: {report.get('failed', 'not completed')}.\n\n"
        if report.get('error'):
            summary += report['error'] + '\n'
        for row in report['files']:
            if not row['matches']:
                summary += f"- `{row['path']}` ({row['variant']}): {row.get('error', 'SHA-256 mismatch')}\n"
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as out: out.write(summary)
        print(summary)
    return code

if __name__ == '__main__':
    raise SystemExit(main())
