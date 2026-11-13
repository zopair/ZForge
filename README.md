# ZForge

**Zubair Autonomous Engineering Forge** — *From Idea to Reality. Autonomously.*

ZForge is a zero-budget-first, evidence-driven autonomous engineering platform. A Chief Agent coordinates specialist agents, discovers tools by demonstrated capability, verifies outcomes, and learns from failures through durable repository memory.

## Non-negotiable principles
1. Evidence over popularity: stars, forks, downloads, and branding are discovery hints only, never proof of superiority.
2. Zero-budget first: no silent introduction of paid APIs, subscriptions, or services.
3. Proof before claims: tool status is scoped to a capability, version, environment, and recorded test.
4. Learning without repeating failures: record errors, root causes, tested fixes, and resource limits.
5. Safe autonomy: least privilege, secret isolation, explicit approval for destructive or externally visible actions.
6. Reversible improvement: task prompts are generated from versioned canonical instructions; changes require evidence and regression tests.

## Start here
- [Architecture](docs/ARCHITECTURE.md)
- [Tool evaluation protocol](docs/TOOL_EVALUATION.md)
- [Agent operating system](docs/AGENT_OPERATING_SYSTEM.md)
- [Chief Agent](prompts/CHIEF_AGENT.md)
- [Agent Architect](prompts/AGENT_ARCHITECT.md)
- [Tool registry](memory/TOOL_REGISTRY.md)
- [Engineering memory](memory/)

## Current status
Foundation scaffold: governance, tool-evaluation protocol, agent prompts, engineering memory, and static PWA shell. The shell is not an AI runtime; no model endpoint, credentials, backend execution service, or autonomous code execution is connected yet.

## GitHub Pages
Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The included workflow deploys the static shell. Runtime capabilities will be added behind secure, testable interfaces.
