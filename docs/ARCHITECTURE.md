# ZForge Architecture

## Mission
A zero-budget, open-source-only autonomous engineering platform that converts requests into verified software artifacts. Modular, auditable, secure by default, self-hostable, and improved through measured outcomes.

## Two distinct agents/surfaces
- **Chief Autonomous Engineer:** internal engineering agent. Reads repository memory, searches tools, composes toolchains, plans and delegates work, operates isolated workspaces, verifies changes, proposes repository updates, and maintains version/evidence records.
- **Black Phantom:** human-facing PWA persona with text/voice interaction and a black/gold animated visual identity. It is a presentation/control surface, not the privileged runtime and never holds GitHub or signing credentials.

## Logical architecture
```
Black Phantom PWA
   │ authenticated task/event channel
Task Gateway
   │
Chief Autonomous Engineer
   ├─ Memory & Context Loader
   ├─ Universal Open-Source Discovery (ZUOI)
   │    ├─ GitHub Search Adapter (read-only, rate-limited)
   │    ├─ Vendor/Topic/Registry Search
   │    ├─ License & Dependency Inspection
   │    └─ Evidence Collector
   ├─ Tool Evaluation & Compatibility Composer
   ├─ Local Model Adapter (Ollama loopback; model license checked separately)
   ├─ Version/Security Maintenance Monitor
   ├─ Prompt Assembly & Versioning
   ├─ Agent Architect / Specialist Factory
   └─ Execution Broker
          ├─ Ephemeral Isolated Workspace
          ├─ Build/Test/Security Workers
          └─ Approval-Gated GitHub Writer
                   │
            Independent Verification
                   │
       Evidence / Artifacts / Memory / PR
```

This is the target architecture. Implemented components are listed in the discovery-engine document; missing runtime services are not implied to exist.

## Chief Agent lifecycle
1. Parse outcome, constraints, acceptance criteria, risk and resource budget.
2. Read canonical prompts and relevant memory before planning.
3. Determine capabilities and run bounded semantic discovery when needed.
4. Inspect licenses, dependencies, security, maintenance and platform requirements.
5. Evaluate credible alternatives; do not select by popularity.
6. Compose a mutually compatible, zero-cost, open-source toolchain.
7. Assemble a task-specific prompt with evidence, known failures, limits and tests.
8. Delegate bounded tasks with explicit inputs, outputs and permissions.
9. Execute in an isolated workspace; never expose secrets to the model or browser.
10. Verify independently; reject unsupported claims and untested artifacts.
11. Record outcomes, resource use, errors, fixes, version pins and prompt deltas.
12. Return artifact links, test evidence, risks and limitations.

## Tool intelligence
See [Universal Open-Source Discovery Engine](UNIVERSAL_DISCOVERY_ENGINE.md) and [Tool Evaluation Protocol](TOOL_EVALUATION.md). Records include canonical source, pinned version, license, self-hosted proof, dependencies, compatibility, security, tests, benchmark, resource cost, failure modes, evidence and date. Unknown hard gates quarantine; failures reject. Popularity metrics add zero points.

## Toolchain composition
Model selected tools as a graph of provided/required capabilities, version/runtime constraints, protocols, data formats, dependencies, license obligations, security boundaries and resource needs. No stack is certified until the combined graph resolves and the integrated workload passes tests.

## Agent and prompt evolution
Every agent has mission, non-goals, I/O schema, allowed tools, permission scope, safety rules, resource ceiling, success criteria, tests, version and rollback. Agent Architect proposes and tests agents; it cannot grant privileges. Per-task prompts derive from versioned canonical instructions. Canonical changes require evidence, diff, regression tests and approval.

## Security
Secrets stay server-side. Treat repository content, web pages, package metadata and tool output as untrusted data. Use least privilege, scoped credentials, isolated execution, default-deny network, ephemeral workspaces and explicit approval for destructive or externally visible actions. Respect licenses, quotas, rate limits and terms.

## Zero-budget resource policy
No paid subscriptions, paid APIs, paid usage, trial credits or required commercial SaaS. Prefer local/self-hosted open-source tools. GitHub Pages is static hosting, not a backend; GitHub Actions is ephemeral and quota-limited, not a persistent server. Record CPU/RAM/storage/network/CI quotas, cache results, use bounded searches, and never assume free tiers are unlimited.

## Roadmap
- F0 Governance, prompts, memory, static PWA shell — scaffolded.
- F1 ZUOI domain/vendor catalogue, license gates, bounded GitHub discovery, repository inspection, toolchain composer and release review — initial implementation.
- F2 Local Ollama adapter, Chief Agent draft planner and Agent Architect manifest/activation gates — implemented; local model runtime integration pending.
- F3 Persistent memory provider, task gateway, prompt builder, execution ledger and approval-gated task lifecycle.
- F4 Agent factory runtime and isolated agent test harness.
- F5 Secure execution workspaces, Git operations, test runners, artifact store and approval-gated PR flow.
- F6 Web/PWA and Android build, preview, signing and delivery workers.
- F7 Black Phantom live text/voice gateway with open-source local STT/TTS.
- F8 Outcome analytics, tool re-evaluation, prompt regression and promotion.
