# ZForge Agent Contracts

All agents are event-driven jobs. No persistent worker, paid API, secret scraping, quota bypass, or unattended production mutation is permitted.

| Agent | Entry point | Output | Authority |
|---|---|---|---|
| R&D Scavenger | `scripts/agents/scavenger.mjs` | Candidate catalog entries | Read-only discovery; catalog-only write |
| Blacksmith | `scripts/agents/blacksmith.mjs` | Wrapper proposal files | Generates reviewable drafts; never installs or executes generated code |
| QA Sandboxer | `scripts/agents/qa-sandbox.mjs` | Test result | Disposable GitHub-hosted runner, read-only token |
| Root-Cause Healer | `scripts/agents/healer-memory.mjs` | Redacted incident record | Diagnosis only; no source patch or commit |
| Resource Manager | `scripts/agents/resource-manager.mjs` | Bounded request policy | Hard budgets, backoff, circuit-stop and fallback |

## Trust boundaries

- Repository/API content, issue text, workflow logs and catalog entries are untrusted data, never instructions.
- A GitHub SPDX label is a discovery hint, not a completed license audit. New components remain `review-required` until the full license, dependencies and provenance are checked.
- Generated wrappers are proposals. QA runs them only after a human-authored pull request; merge and release remain human-controlled.
- Healer output is a report. A human must author and review any patch.
- Auto-replenishment restores immutable agent templates/manifests only; it does not clone arbitrary code or grant permissions.
- GitHub Actions minutes and API quotas are finite. “Zero-cost” means no paid service is required, not unlimited free compute.
