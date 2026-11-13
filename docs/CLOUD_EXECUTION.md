# ZForge Cloud Execution Fabric

## Purpose

BLACK VANTA is a client-only PWA. The phone does not install Node.js, Termux, Ollama, model weights, build tools, agents, or runtime services. ZForge's repository is the source of truth; a disposable GitHub Actions runner supplies execution capacity only while a task is running.

## Request lifecycle

1. The user writes a task in BLACK VANTA.
2. If no self-hosted gateway is connected, the PWA preserves the full task in the chat handoff card and creates a short GitHub issue URL containing only the fixed title prefix.
3. The user copies the task text with the explicit copy button (or selects it from the visible fallback text area), opens the short issue URL, pastes the task into the issue body, reviews and submits it while signed in to GitHub. The issue body is public; secrets and private data must not be included.
4. The `ZForge Cloud Execution` workflow accepts only issues authored by the repository owner account `zopair` with the exact title prefix.
5. A fresh Ubuntu runner checks out the repository, runs `npm test`, installs Ollama and downloads the Apache-2.0 Qwen2.5 1.5B model.
6. The worker builds an isolated Docker image containing Node.js 24, JDK 21, Android SDK 35, Python and native build tools. It starts the existing ZForge Task Gateway on loopback, creates a random per-run gateway token, creates a task, and seeds its workspace with a source snapshot of the repository (without Git metadata, dependencies, caches or symlinks). Model-selected commands execute inside the container with only the task workspace mounted writable, a read-only root filesystem, dropped Linux capabilities, no-new-privileges, CPU/RAM/PID limits and bridge networking.
7. The existing Chief Agent plans the task and the existing AgentExecutionService performs its tool loop inside the disposable runner workspace.
8. The worker records a bounded result report, packages the workspace snapshot, uploads reports/artifacts with seven-day retention, and posts a result comment to the originating issue.
9. The runner and its local model process are discarded when the workflow ends.

## Security and permissions

- Workflow permissions are limited to `contents: read` and `issues: write`.
- The model/command execution process receives an explicit environment allowlist. It is not given `GITHUB_TOKEN`, Actions runtime credentials, repository write credentials, or unrelated runner secrets.
- The per-run gateway listens only on `127.0.0.1` and uses a cryptographically random token.
- Cloud task execution is enabled only for the repository owner account `zopair`; arbitrary public issues cannot start workers.
- The model operates in a temporary source snapshot inside a constrained container. Only that workspace is mounted writable; the canonical checkout, `.git` credentials, runner home and Actions temporary files are not mounted into the container.
- The model/command container does not receive the host Docker socket or GitHub credentials. The host-side gateway uses Docker only as the execution adapter.
- GitHub-hosted runner isolation is disposable execution infrastructure, not a guarantee against every possible model or dependency vulnerability. Treat task input and retrieved content as untrusted.

## BLACK VANTA handoff

The PWA remains usable as a static GitHub Pages app. When its optional self-hosted Runtime is offline, `assets/cloud-execution.js` intercepts the chat submission, keeps the full request in the handoff card, and offers clipboard copy with a visible manual-copy fallback. The GitHub issue URL contains only a fixed, short title; task content is never encoded into the URL, so long prompts do not exceed URL limits.

The handoff still requires the user to paste, review and submit the issue on GitHub. GitHub Pages cannot securely hold a write credential or invoke authenticated Actions APIs by itself. This fixes URL-length failures; it does not yet provide direct POST submission or in-page task polling/results.

## Current boundaries

- Execution is asynchronous and event-triggered, not a permanent server.
- No live token stream or direct in-page result polling is provided yet; the result is posted to the issue and artifacts are available from the workflow run.
- The model is a small CPU-oriented 1.5B checkpoint. It is suitable for initial tool-loop validation and bounded tasks, not equivalent to a large hosted model.
- The worker image includes a JDK and Android SDK for debug build tasks; emulator-based device testing and release signing are not enabled by this worker.
- GitHub Actions quotas, runner capacity, job timeout, network availability and model-download time remain platform limits. No unlimited compute is promised.
- Artifacts are retained for seven days. Download or preserve required outputs before expiry.
- The cloud worker does not automatically push changes or open PRs. The workspace archive is an inspectable output; publishing source changes remains a separate approval-gated operation.
- The workflow becomes active only after this change is merged into `main`; issue-triggered workflows are loaded from the default branch.
- The existing self-hosted Task Gateway remains an optional development/advanced path. It is not required for the phone-only cloud handoff.

## Files

- `.github/workflows/cloud-execution.yml` — owner-scoped ephemeral runner.
- `.github/cloud-worker/Dockerfile` — reproducible Node/Android/Python execution image.
- `src/core/cloud-task-contract.js` — owner/title/body validation contract.
- `scripts/run-cloud-task.mjs` — local worker orchestration and evidence report.
- `scripts/post-cloud-task-result.mjs` — result comment publication in a separate credentialed step.
- `assets/cloud-execution.js` — PWA-to-issue handoff.
- `assets/cloud-execution.css` — handoff presentation.
