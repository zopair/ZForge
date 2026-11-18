# ZForge — PoC Preview Guide

## Preview objective

Demonstrate one real, harmless engineering workflow and its evidence. This is a proof-of-concept acceptance pass, not a production-readiness or cross-browser certification exercise.

## Minimum local setup

Requirements: Node.js 20+.

```bash
npm test
npm run runtime:check
npm start
```

The runtime entry point is `src/runtime/server.js`. Configure only the local model/runtime settings required by the feature being demonstrated. Keep the runtime local; do not expose it publicly for a showcase.

## Suggested 5-minute walkthrough

1. Open the BLACK VANTA interface and explain the human approval boundary.
2. Submit a small, non-destructive engineering task.
3. Show the Chief Agent plan and specialist DAG proposal where available.
4. Show task progress and the evidence required for completion.
5. Open the relevant engineering memory and explain how failed approaches are retained.

## PoC acceptance — minimum bar

- [ ] `npm test` passes.
- [ ] `npm run runtime:check` passes.
- [ ] The interface loads in the demonstration browser.
- [ ] One harmless task completes with visible evidence.
- [ ] Approval is required before external or destructive actions.
- [ ] Runtime permissions and execution backend are explained honestly.

A successful minimum-bar demonstration is sufficient to proceed with stakeholder feedback. Do not block the PoC on multi-browser, load, performance, or production-hardening work.

## CI and resource policy

Normal CI runs the dependency-free unit suite and lightweight syntax checks only. The Playwright browser smoke job is manual and opt-in from GitHub Actions → **ZForge Quality Gate** → **Run workflow** → enable `run_browser_smoke`. It installs Chromium only. It is not required for the basic preview.

Do not repeatedly rerun successful checks or install additional browser engines without a specific, reproducible issue that requires them.

## Known limits to disclose

The host process runner is not an OS/container security boundary. Use an unprivileged service account or the constrained container backend. Persistent distributed recovery, SBOM/provenance, Android release signing, iOS workers, independent verification workers, and production deployment automation remain incomplete. GitHub Pages hosts only the static shell; it is not the runtime.

## Reviewer evidence

Capture the CI run, a short screen recording, the exact Node version, and the task input/output used in the demonstration. Never include secrets, tokens, or private task data.
