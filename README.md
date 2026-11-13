# ZForge

**Zubair Autonomous Engineering Forge** — *From Idea to Reality. Autonomously.*

ZForge is a zero-budget, open-source-only autonomous engineering platform. Its internal Chief Autonomous Engineer discovers, verifies, composes and maintains engineering tools; specialist agents build and test software; Black Phantom is the human-facing text/voice control surface.

## Non-negotiable principles
1. **Open source only:** public source code is not enough; verify OSI-compatible licensing for code, dependencies, models, data, fonts and assets.
2. **Zero budget:** no paid APIs, subscriptions, credits, required commercial SaaS or expiring trial dependencies.
3. **Evidence over popularity:** stars, forks, downloads and branding are discovery hints only, never proof of superiority.
4. **Proof before claims:** status is scoped to capability, version, environment and reproducible test.
5. **Learning without repeating failures:** preserve root causes, tested fixes, failed approaches and resource limits.
6. **Safe autonomy:** least privilege, secret isolation, isolated execution, explicit approval for destructive or externally visible actions.
7. **Reversible improvement:** updates are proposed, tested in isolation and rollback-ready; no silent production upgrades.

## Architecture
- [Architecture](docs/ARCHITECTURE.md)
- [Universal Open-Source Discovery Engine](docs/UNIVERSAL_DISCOVERY_ENGINE.md)
- [Secure Execution Runtime Contract](docs/EXECUTION_RUNTIME_CONTRACT.md)
- [Black Phantom UI](docs/BLACK_PHANTOM_UI.md)
- [Tool evaluation protocol](docs/TOOL_EVALUATION.md)
- [Agent operating system](docs/AGENT_OPERATING_SYSTEM.md)

## Internal components
- Discovery planner, strict license/zero-cost gates and toolchain composition: src/core/discovery-engine.js
- Bounded discovery orchestration with query budget and cache: src/core/discovery-service.js
- Read-only GitHub search adapter with official rate-limit stop: src/adapters/github-discovery.js
- Repository metadata/license/manifest inspector: src/adapters/github-repository-inspector.js
- Official release metadata adapter and review-only update monitor: src/adapters/github-release-monitor.js and src/core/release-monitor.js
- Chief Agent: prompts/CHIEF_AGENT.md
- Agent Architect: prompts/AGENT_ARCHITECT.md
- Tool registry and engineering memory: memory/

## Current implementation status
The repository contains a static PWA shell and initial discovery/evaluation modules. The GitHub adapter is read-only. No model runtime, live Chief Agent, backend task gateway, isolated code execution worker, GitHub write credential, voice runtime, Android build worker, or autonomous repository mutation is connected yet. Black Phantom is currently specified, not fully integrated. GitHub Pages serves static files only; Actions are ephemeral and quota-limited.

## Tests
Run `npm test` with Node.js 20 or newer. CI uses Node.js 24.

## GitHub Pages
Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The included workflow deploys the static shell.
