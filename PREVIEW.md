# ZForge — Preview Readiness

## What to preview
ZForge combines the BLACK VANTA PWA, the engineering runtime, agent planning, and bounded specialist orchestration. Treat the browser shell and the self-hosted runtime as separate preview surfaces.

## Fast local checks
Requirements: Node.js 20+.

```bash
npm test
npm run runtime:check
npm start
```

The runtime entry point is `src/runtime/server.js`. Configure only the local model/runtime settings required by the features you intend to demonstrate. Do not expose the runtime publicly for a showcase.

## Suggested 5-minute walkthrough
1. Open the BLACK VANTA interface and explain the human approval boundary.
2. Submit a small, non-destructive engineering task.
3. Show the Chief Agent plan and specialist DAG proposal.
4. Show task progress and the evidence required for completion.
5. Open the relevant engineering memory and explain how failed approaches are retained.

## Preview acceptance
- [ ] `npm test` passes.
- [ ] `npm run runtime:check` passes.
- [ ] UI loads without browser-console errors.
- [ ] A harmless task completes with visible evidence.
- [ ] Approval is required before external or destructive actions.
- [ ] Runtime permissions and execution backend are explained.

## Known limits to disclose
The host process runner is not an OS/container security boundary. Use an unprivileged service account or the constrained container backend. Persistent distributed recovery, SBOM/provenance, Android release signing, iOS workers, independent verification workers, and production deployment automation remain incomplete. GitHub Pages hosts only the static shell; it is not the runtime.

## Reviewer evidence
Attach the CI run, a short screen recording, the exact Node version, and the task input/output used in the demonstration. Never include secrets, tokens, or private task data.
