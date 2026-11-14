# Recurring Engineering Failures and Prevention Register

**Last reviewed:** 2026-11-14  
**Scope:** ZForge repository, BLACK VANTA PWA, GitHub Actions CI/Pages, cloud worker, and browser smoke tests.

This register captures observed incidents and verified or still-unconfirmed causes. It is a prevention document, not a claim that every proposed fix has already been implemented.

## 1. Incident register

| ID | Incident / evidence | Finding | Confidence | Prevention / closure condition |
|---|---|---|---|---|
| ZF-001 | Browser smoke SyntaxError in runs [43509972044](https://github.com/zopair/ZForge/actions/runs/43509972044) and [43541629570](https://github.com/zopair/ZForge/actions/runs/43541629570) | Regex escaping in `scripts/browser-smoke.mjs` produced an invalid regular expression before the browser suite could run. | Confirmed | Run `node --check` on every executable JS/MJS entrypoint before browser installation/execution. Keep a focused syntax regression test. Do not treat a Node exit code as a root cause. |
| ZF-002 | Browser smoke expected the old manual GitHub handoff in run [43510346547](https://github.com/zopair/ZForge/actions/runs/43510346547) | The test contract lagged behind the new direct-chat behavior. | Confirmed | Update acceptance tests in the same change as user-flow changes. Test externally observable behavior and assert the intended route, not obsolete selectors or messages. |
| ZF-003 | GitHub auth status wait failed in run [43511544188](https://github.com/zopair/ZForge/actions/runs/43511544188) | The settings panel correctly collapsed after connection, while the test waited for visible text inside the now-hidden panel. | Confirmed | Assert the correct state explicitly: text content for a hidden status, visibility only when visibility is part of the product contract. Avoid arbitrary sleeps and longer timeouts. |
| ZF-004 | Plan approval button timed out in run [43529339343](https://github.com/zopair/ZForge/actions/runs/43529339343) | Cloud form interception also captured submissions while a local Runtime was connected, preventing the normal planning flow. | Confirmed | Maintain one explicit submission owner per mode. Regression-test local Runtime and cloud fallback independently, including that only the selected path receives the request. |
| ZF-005 | WebKit auth failed in run [43534767630](https://github.com/zopair/ZForge/actions/runs/43534767630) | The GitHub API mock did not initially model CORS preflight and CORS response headers. | Confirmed for the earlier failure | Mock OPTIONS and all relevant CORS response headers; assert WebKit actually exercises preflight. |
| ZF-006 | Latest PR #35 browser run [43541902259](https://github.com/zopair/ZForge/actions/runs/43541902259) | Chromium and Firefox passed, but WebKit auth ended with `Bad credentials`. The latest fixture includes OPTIONS handling, but the failure remains. It is not yet proven whether WebKit bypassed the route, the fixture response differed, or the application request path differed. | Failure confirmed; root cause unresolved | Capture request method/URL, OPTIONS count, request-failed events, response status/headers/body (redacted), and Playwright trace. Ensure no request can silently fall through to live GitHub with a fake token. Close only after all three engines pass on the latest PR head. |
| ZF-007 | Cloud conversation run [43559369006](https://github.com/zopair/ZForge/actions/runs/43559369006), task artifact `zforge-cloud-task-37` | Artifact reported `planning_failed` with `The operation was aborted due to timeout`. `OllamaModelAdapter` defaults to 60,000 ms while the cloud conversation API wrapper allows 8 minutes and the workflow allows 50 minutes. | Confirmed | Make model timeout configurable per environment/model; use a bounded model-call timeout (initial target 240,000 ms, then tune from measured p95), a task-wide deadline, and a short warm-up/readiness inference. Report `model_timeout` distinctly. Do not simply increase the entire workflow timeout. |
| ZF-008 | Same cloud task artifact | The report path can label a non-plan response as `completed` even when `diagnosticCode` is `planning_failed`; the script then exits non-zero. This creates contradictory status semantics. | Confirmed by code inspection and artifact | Use explicit terminal states such as `answered`, `awaiting_approval`, `planning_failed`, `timed_out`, and `execution_failed`. A diagnostic failure must never be represented as successful completion. |
| ZF-009 | Repeated cloud-worker provisioning | Each fresh hosted runner installs Ollama and downloads the approximately 986 MB model artifact shown in run logs. | Confirmed | Measure provisioning and inference separately. Use a verified immutable model digest and cache only if it reduces total Actions time/storage without weakening trust boundaries. Keep a no-cache fallback. |
| ZF-010 | PWA cache/version drift | `main` currently has `zforge-black-vanta-v13`; v14 is present only in unmerged PR #35. Cache-first shell behavior can keep old assets active until the new service worker installs and activates. | Confirmed | Version static assets by content hash or commit/build ID; make the HTML/app-shell update strategy explicit; test service-worker upgrade, old-cache deletion, offline launch, and fresh-client behavior. |
| ZF-011 | CI runs cancelled after newer commits | `.github/workflows/ci.yml` uses `cancel-in-progress: true` per PR. This intentionally cancels stale runs. | Confirmed, intended behavior | Treat cancellation as superseded, not as a test failure. Before merge, verify the latest PR head SHA and its required checks, not an earlier run. |
| ZF-012 | Deployment verification gap | Pages deploys only on pushes to `main`; a green PR workflow does not prove that Pages deployment completed or that the live PWA serves the new assets. | Confirmed by workflow configuration | Add a post-deploy smoke check against the public Pages URL: HTTP status, expected build identifier, critical assets, service-worker version, and one minimal browser journey. Keep deployment branch restricted to `main`. |
| ZF-013 | Mutable CI/toolchain inputs | Workflows use action version tags (for example `actions/checkout@v5`) and cloud provisioning runs `curl ... ollama.com/install.sh | sh`. | Confirmed by workflow inspection | Pin Actions to verified full commit SHAs; pin installer/model versions and verify checksums/digests. Review updates deliberately rather than following mutable tags at runtime. |

## 2. Mandatory failure-triage protocol

For every failed workflow:

1. Read the latest failed job log. A UI summary such as `Process completed with exit code 1` is not a diagnosis.
2. Record run ID, PR number, exact head SHA, job, step, browser/OS, source file and line, exception, and the awaited condition.
3. Classify the failing layer: application, test fixture/mock, browser engine, dependency/toolchain, runner/network, or deployment/cache.
4. Compare sibling jobs and browser engines. If only one engine fails, inspect browser-specific network and fixture behavior before changing application code.
5. Preserve the failing evidence before modifying the test: trace, screenshot, console/page errors, request method/URL, response status and CORS headers. Redact credentials and tokens.
6. Write a minimal regression assertion that fails for the observed condition.
7. Apply the smallest fix at the failing layer. Do not add sleeps, broaden timeouts, hide DOM waits, skip browsers, or weaken assertions without evidence.
8. Re-run focused regression tests, the complete unit suite, and the complete Chromium/Firefox/WebKit matrix.
9. Verify that the successful run belongs to the latest PR head SHA.
10. For a deployment change, separately verify the Pages workflow and the live site. A merged PR or green CI alone is not proof of deployment.

## 3. CI reliability improvements

### Fast validation before expensive browser setup

- Run unit tests and syntax checks before downloading browser engines.
- Keep the Playwright version exact and reproducible; prefer a checked-in test dependency lockfile if it does not compromise the dependency-free production/runtime design.
- Cache Playwright browser binaries only with a key containing OS and exact Playwright version. Cache misses must remain safe and regenerate the browsers.
- Do not cache secrets, tokens, generated workspaces, or untrusted build outputs.
- Keep Chromium, Firefox, and WebKit as required checks; do not turn a browser failure into a warning.

### Browser diagnostics

- On failure, retain a Playwright trace and screenshot plus a compact network diagnostic bundle.
- For cross-origin GitHub tests, log OPTIONS and actual request handling separately.
- Use a local mock/proxy that fails closed: unexpected requests must fail with a clear fixture error and must never fall through to the live GitHub API.
- Never print Authorization headers or token values.
- Make the mock contract reusable and independently tested instead of reimplementing CORS behavior inline in one long smoke script.

### Workflow reproducibility and supply-chain integrity

- Pin third-party Actions to full verified commit SHAs; keep versions readable in comments and update through deliberate review.
- Pin Node and Playwright versions. Use lockfiles for test dependencies where appropriate.
- Pin Ollama release and model digest; verify downloaded artifacts.
- Replace mutable remote installer execution with a pinned, checksum-verified release/install artifact.
- Keep least-privilege workflow permissions and separate privileged publication steps from model/command execution.

## 4. Cloud model reliability improvements

Current observed mismatch:

- Ollama adapter default timeout: 60 seconds.
- Cloud conversation HTTP wrapper timeout: 8 minutes.
- Cloud workflow job timeout: 50 minutes.

Required design:

1. Add an environment-controlled model request timeout, with a cloud-specific initial target of 240 seconds and measured tuning.
2. Add a task deadline below the GitHub Actions job timeout, leaving time for artifact upload and result publication.
3. Warm the model with a bounded, deterministic readiness inference before accepting the task.
4. Record model name/digest, prompt/evaluation token counts, inference duration, and timeout phase.
5. Use bounded retries only for transient transport/startup errors; do not retry deterministic invalid plans indefinitely.
6. Distinguish intent classification, conversational response, plan generation, and approved execution in telemetry.
7. Ensure a model timeout returns a truthful failure/inconclusive state and never a success-shaped report.
8. Keep deterministic capability questions outside model provisioning and inference.

## 5. PWA and deployment reliability

- Keep Pages deployment restricted to `main`.
- Add a build/deployment identifier derived from the exact commit SHA.
- Prefer content-hashed static assets or a generated cache revision over manually remembered cache-name increments.
- Use a deliberate navigation strategy for `index.html` and a cache-first strategy only for immutable/versioned assets.
- Test service-worker installation failure, activation, stale cache cleanup, offline shell availability, and update after deployment.
- After deploy, request the live page and critical JS/CSS files and verify that their build identifier matches the deployed commit.
- Do not announce a feature as live until Pages deployment and the live smoke check both pass.

## 6. PR and merge gate

A PR is merge-ready only when all are true:

- Latest PR head SHA is known and unchanged during final verification.
- Unit tests pass.
- All executable JS/MJS entrypoints pass syntax validation.
- Browser smoke passes in Chromium, Firefox, and WebKit.
- Regression tests cover the exact incident being fixed.
- No required check is cancelled, skipped, or missing.
- Diff is reviewed for unrelated changes and secrets.
- Merge is performed only under the repository owner's explicit approval.
- After merge, Pages deployment and live-site verification are completed separately.

For PR #35 specifically, run [43541902259](https://github.com/zopair/ZForge/actions/runs/43541902259) is failed: unit tests passed, but WebKit authentication failed with `Bad credentials`. The PR must remain unmerged until the latest head passes the full required matrix. A successful local mock test alone does not prove the real phone-to-GitHub-to-worker round trip.

## 7. Status vocabulary

Use these terms precisely:

- **Code changed:** source modification exists.
- **PR open:** change is proposed, not part of `main`.
- **Checks green:** all required checks passed for the exact current PR head.
- **Merged:** GitHub confirms the PR is merged into `main`.
- **Pages deployed:** deployment workflow succeeded for the merge commit.
- **Live verified:** the public site and critical user journey were checked after deployment.
- **End-to-end verified:** the actual user environment completed the real flow, not only a mocked browser test.

Never collapse these states into a single word such as “done” or “green”.

## 8. Evidence and references

- [PR #35 — Restore direct BLACK VANTA cloud chat](https://github.com/zopair/ZForge/pull/35)
- [Latest PR #35 quality gate](https://github.com/zopair/ZForge/actions/runs/43541902259)
- [Cloud run with model planning timeout](https://github.com/zopair/ZForge/actions/runs/43559369006)
- [Adjacent successful cloud run](https://github.com/zopair/ZForge/actions/runs/43559877256)
- [Browser smoke failure playbook in PR #35](https://github.com/zopair/ZForge/blob/fix/black-vanta-direct-cloud-chat/docs/BROWSER_SMOKE_FAILURE_PLAYBOOK.md) — not yet part of main.
- [Engineering issue ledger](ENGINEERING_ISSUE_LEDGER.md)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [Playwright CI guidance](https://playwright.dev/docs/ci)
- [Playwright trace viewer](https://playwright.dev/docs/trace-viewer)
- [GitHub Actions dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)
- [GitHub Pages workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Service worker deployment and cache versioning](https://developer.chrome.com/docs/workbox/service-worker-deployment)

---

**Maintenance rule:** Every future production/CI incident must add or update an entry here and, where applicable, create a structured record through the Engineering Issue Ledger. A problem is not considered permanently addressed until the regression guard exists and the relevant verification evidence is recorded.
