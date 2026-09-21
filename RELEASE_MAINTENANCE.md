# Release closeout and verification

This maintenance candidate follows the production-verified P1/P2 release `e772992`. It repairs verification coverage and routing, synchronizes old release records, and gives narrow comparison charts more space between time labels. It does not change the trading engine, market tapes, strategy records or private-source boundaries.

## Why replace the previous trigger

The existing verifier listened only for `workflow_run` from the GitHub-managed dynamic Pages workflow. No execution of that listener was observed after P1/P2 deployment. Its static root-page list also omitted both new P2 pages. The precise platform reason for the missing event has not been established; the replacement does not depend on it.

`Verify published website` now starts on each push to `main`, and also supports manual dispatch from `main`. It waits for the **same SHA's** dynamic Pages run to finish successfully before requesting the website. A failed, absent or superseded deployment cannot be reported as verified. A newer main push cancels the previous verifier. The script checks main again after the HTTP checks.

GitHub documents [push and manual workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and the [head_sha workflow-run filter](https://docs.github.com/en/rest/actions/workflow-runs). The verifier uses read-only `contents` and `actions` permissions. No merge, publication, issue-writing, account mutation or strategy execution occurs in it.

## What gets checked

All root HTML pages are discovered, alongside root metadata and every file under `assets`, `portfolio-assets` and `data`. Existing P1/P2 manifest hashes and published-data sizes must reconcile with the exact checkout. Every public path is requested both normally and with a version query; HTTP 200 and matching SHA-256 are required for both. A fresh cache-busted response cannot hide stale ordinary URLs. Manifests outside the enumerated public paths fail explicitly.

The script waits for manifest propagation, retries transient file failures, and writes a JSON report even on an error. The Actions run fails visibly and records a job summary plus an artifact retained for 14 days. Delivery of GitHub email/mobile notifications depends on the repository owner's notification settings; no external notification channel is configured here.

## Running and maintaining it

From an exact Git checkout of the currently deployed main commit:

```sh
python scripts/verify_public_release.py \
  --sha "$(git rev-parse HEAD)" \
  --repository Yiping-Yin/Yiping-Yin.github.io \
  --output qa/live-release-verification.json
```

`GH_TOKEN` is optional for public API reads, and is sent only to `api.github.com`, never to the public website. The workflow supplies its read-only token. A manual rerun can be started through Actions → Verify published website → Run workflow, using `main`.

The matcher targets the current GitHub-managed dynamic Pages path. A move to a custom Pages publisher must update `PAGES_PATH` and its tests. If main advances during an audit, rerun for the current main; do not interpret `superseded` as a pass.

## Candidate acceptance and production boundary

`Release closeout acceptance` tests the new verifier against the unchanged deployed `e772992` release, reproduces the crowded-tick assertion on the old page, then requires the corrected candidate to pass. It also checks six 404 recovery links using keyboard activation and reruns the existing P1/P2 tests. The production workflow's actual main-push trigger must be observed after this PR is merged; a candidate live trial is not proof of a future trigger firing.

The P1/P2 checkboxes and delivery records now identify their already-completed production audit, not this unmerged maintenance candidate. Preserve the revised 404 and maintenance files during a future export. The chart helper and comparison-page query version are covered by the regenerated `release.json.publicP2` manifest. No full accessibility audit or physical-device Safari test is claimed.
