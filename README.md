# ZForge

**Zubair Autonomous Engineering Forge** — *From Idea to Reality. Autonomously.*

ZForge is a zero-budget, open-source-only autonomous engineering platform. Its internal Chief Autonomous Engineer discovers, verifies, composes and maintains engineering tools; specialist agents build and test software; BLACK VANTA is the human-facing text/voice control surface.

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
- [Local Model Runtime Policy](docs/MODEL_RUNTIME_POLICY.md)
- [Local Model Registry](memory/MODEL_REGISTRY.md)
- [Local Model Runtime Policy](docs/MODEL_RUNTIME_POLICY.md)
- [BLACK VANTA UI](docs/BLACK_VANTA_UI.md)
- [Tool evaluation protocol](docs/TOOL_EVALUATION.md)
- [Agent operating system](docs/AGENT_OPERATING_SYSTEM.md)

## Internal components
- Discovery planner, strict license/zero-cost gates and toolchain composition: src/core/discovery-engine.js
- Bounded discovery orchestration with query budget and cache: src/core/discovery-service.js
- Read-only GitHub search adapter with official rate-limit stop: src/adapters/github-discovery.js
- Repository metadata/license/manifest inspector: src/adapters/github-repository-inspector.js
- Official release metadata adapter and review-only update monitor: src/adapters/github-release-monitor.js and src/core/release-monitor.js
- Local-only Ollama model adapter: src/adapters/ollama-model-adapter.js
- Local repository memory and canonical prompt providers: src/adapters/local-repository-memory-store.js
- Approval-gated GitHub task branch/file and draft-PR writer: src/adapters/github-repository-writer.js
- Chief Agent draft planner: src/core/chief-agent.js
- Authenticated task gateway and durable task ledger: src/runtime/task-gateway.js
- Self-hosted local workspace process runner: src/runtime/local-execution-runtime.js
- Runtime API and deployment guide: docs/TASK_GATEWAY.md
- Agent manifest and activation gates: src/core/agent-architect.js
- Local-only Ollama model adapter: src/adapters/ollama-model-adapter.js
- Chief Agent draft planner: src/core/chief-agent.js
- Agent manifest and activation gates: src/core/agent-architect.js
- Chief Agent: prompts/CHIEF_AGENT.md
- Agent Architect: prompts/AGENT_ARCHITECT.md
- Tool registry and engineering memory: memory/

## Current implementation status
The repository contains an interactive BLACK VANTA PWA preview with a working local chat composer, universal discovery/evaluation modules, a loopback-only Ollama adapter, a draft-only Chief Agent planner, Agent Architect validation gates, bounded local memory/prompt readers, and an approval-gated GitHub task-branch/file writer. The local model adapter has not yet been tested against an installed model, and no GitHub write credential or approval-verification service is configured. A self-hosted authenticated task gateway, durable task ledger and local workspace process runner are now implemented. The current process runner is not an OS/container sandbox and accepts explicit authenticated commands; model-driven tool orchestration, PWA-to-runtime event streaming, isolated container workers, live voice and Android/iOS build/signing workers remain to be integrated. GitHub Pages serves static files only; Actions are ephemeral and quota-limited.

## Tests
Run `npm test` with Node.js 20 or newer. CI uses Node.js 24.

## GitHub Pages
Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The included workflow deploys the static shell.
