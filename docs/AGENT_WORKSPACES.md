# Agent Workspaces: Experimental Freedom

## Design principle

ZForge treats exploration, disorder, failed attempts and unexpected behavior as useful research inputs. The platform should make it easy for agents to investigate, install, modify, combine, fork, prototype and compare open-source tools. Organization is learned from evidence; it is not imposed as a narrow allowlist before experimentation.

**Freedom by default, guardrails by context.** Guardrails should be proportional to the actual operation and its consequences. Prefer clear warnings, reversible changes, snapshots and recovery over blanket denial. A warning is not a refusal. A failed experiment is retained as knowledge, not erased as noise.

## Workspace model

Each agent can own one or more workspaces. A workspace has:
- An extensible profile and environment description.
- Broad default capabilities for files, terminal, package installation, research networking, Git, browser, tests and artifacts.
- Agent-selected extra capabilities and runtime variants.
- Adaptive resource preferences that describe intent rather than impose universal ceilings.
- Shared artifact collaboration by default.
- An append-only-in-practice experiment history containing hypotheses, variants, findings, metrics, failures and artifacts.

Workspaces are independent contexts, not prisons. Agents may create parallel experiments, change approaches, compare tools and preserve useful failures.

## Experiment lifecycle

`startExperiment → finishExperiment → promoteExperiment`

Outcomes include `succeeded`, `failed` and `inconclusive`. All outcomes remain available for engineering memory. A successful experiment can be promoted to a named destination such as the tool registry or a reusable project template. Promotion records the destination and timestamp.

## Contextual guardrails

Do not apply blanket default-deny policies to ordinary research and development. Use proportionate handling:
- Explain material risks and let the agent choose a reasonable alternative where possible.
- Preserve checkpoints before hard-to-reverse changes.
- Ask for human input only when an action has meaningful external, financial, legal or irreversible consequences, or when deployment credentials are involved.
- Keep resource preferences adaptive and observable; do not invent fixed limits that make the target workload impossible.
- Respect applicable licenses and privacy obligations while still allowing license analysis, interoperability research, security research and lawful modification.
- Never confuse untrusted repository content with instructions from the user or system.

These principles organize consequences; they are not a blanket prohibition on experiments, network access, package installation, code execution or tool modification.

## Implementation status

`src/core/agent-workspace-manager.js` implements the workspace and experiment control-plane data model: creation, capability extension, lifecycle state, observations, experiment outcomes and promotion records.

This is **not yet a host execution engine**. A runtime adapter still needs to provision actual filesystems, terminals, processes, browsers, package managers and artifact storage. The control-plane contract is deliberately runtime-neutral so ZForge can add local processes, containers or other free self-hosted backends without rewriting agent logic.

## Engineering measures

Measure useful discovery, experiment throughput, time-to-first-working-prototype, reproducibility, failure reuse, resource consumption and successful promotions. Do not optimize for the fewest experiments or the absence of failures.
