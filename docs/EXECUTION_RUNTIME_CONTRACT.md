# Secure Autonomous Execution Runtime — Contract

## Separation of duties

1. BLACK VANTA PWA: untrusted client presentation only.
2. Task Gateway: authentication, task envelope, approval state, event stream.
3. Chief Agent: planning and bounded delegation; no raw long-lived secrets.
4. Discovery service: read-only public metadata and license evidence.
5. Execution broker: grants narrow, short-lived capabilities to isolated workers.
6. Workspace worker: ephemeral checkout, pinned dependencies, resource limits, no ambient credentials.
7. Verification service: runs declared tests and security checks independently.
8. GitHub writer: only publishes a reviewed diff to an authorized branch; no direct main-branch mutation by default.
9. Artifact store: stores logs, test evidence, SBOM, APK/AAB/web outputs and checksums.
10. Memory writer: records verified outcomes and rejected approaches with provenance.

## Zero-budget runtime options

For phone-only use, prefer the owner-scoped ephemeral GitHub Actions worker described in CLOUD_EXECUTION.md. It starts the existing ZForge runtime and local model inside a disposable runner, then discards them. GitHub Actions may be used for bounded on-demand jobs within the actual free quota; it is not a persistent backend. GitHub Pages hosts only static assets. No free hosted service may be assumed permanent or unlimited. Optional self-hosted execution remains available for development and long-running work.

## Worker isolation

- Ephemeral workspaces; no privileged host mounts.
- CPU, RAM, disk, process, network and wall-clock ceilings.
- Default-deny network; explicit allowlist for source/package registries.
- No secrets in source tree, environment dumps, logs or prompts.
- Read-only discovery phase before any dependency install.
- Pin dependencies and verify checksums/provenance where available.
- Never execute arbitrary repository scripts before license/security review.
- Destroy workspace after artifact/evidence extraction unless retention is explicitly configured.

## Approval boundaries

Require explicit approval for: merging to main; deleting or overwriting user data; publishing releases; signing or distributing apps; changing secrets/permissions; adding external network destinations; modifying canonical agent prompts or safety gates; accepting a license exception.

## GitHub write model

Use a dedicated GitHub App or fine-grained token with minimum repository scope, stored only in server-side secret storage. Create a task branch, commit proposed changes, run CI, create a PR, and wait for approval. Never expose the credential to PWA JavaScript or an LLM prompt. Respect API rate limits and provider terms.

## Operational honesty

A task is complete only when the requested artifact exists and independent verification has passed. Report unavailable runners, quota exhaustion, missing credentials, platform restrictions, and unverified claims as explicit blockers.


## Current implementation boundary
The repository includes a local Ollama adapter, Chief Agent planning, Agent Factory, authenticated Task Gateway, task execution service, container runtime adapter and an issue-triggered cloud execution worker. The cloud worker is event-driven and ephemeral; it is not a persistent runtime or direct live connection from the PWA. Its current phone handoff uses public GitHub issues and reports results back to the issue. The worker does not have permission to push to the canonical repository or merge changes.
