# ZForge Architecture

## Mission
A zero-budget, open-source-only autonomous engineering platform that converts requests into verified software artifacts. Modular, self-hostable, and improved through measured outcomes. Exploration and experimentation are first-class capabilities.

## Two distinct agents/surfaces
- **Chief Autonomous Engineer:** internal engineering agent. Reads repository memory, searches tools, composes toolchains, plans and delegates work, operates agent workspaces, verifies changes, proposes repository updates, and maintains version/evidence records.
- **ZForge Conversational Core:** the single user-facing intelligence layer. It handles dialogue, context, capability questions and intent routing; it creates immutable draft plans for engineering requests and waits for explicit approval before execution.
- **BLACK VANTA:** human-facing PWA presentation/control surface with text/voice interaction and a black/gold animated visual identity. It is not the privileged runtime and never holds GitHub or signing credentials. The user does not select or address specialist agents; ZForge orchestrates them internally.

## Logical architecture
```
BLACK VANTA PWA
   │ authenticated conversational/task/event channel
ZForge Conversational Core
   ├─ Conversation Memory & Capability Registry
   ├─ Intent Router (dialogue / engineering request)
   ├─ Plan Preview & Explicit Approval
   └─ Task Gateway
   │
Chief Autonomous Engineer
   ├─ Memory & Context Loader
   ├─ Universal Open-Source Discovery (ZUOI)
   ├─ Tool Evaluation & Compatibility Composer
   ├─ Local Model Adapter
   ├─ Agent Architect / Specialist Factory
   └─ Workspace Manager
          ├─ Research Workspaces
          ├─ Development Workspaces
          ├─ Experimental Workspaces
          ├─ Browser / Build / QA Workspaces
          └─ Runtime Adapter (local / container / other self-hosted)
                   │
       Artifacts / Evidence / Experiment Memory
                   │
          Git branches / PRs / Releases
```

The diagram distinguishes the target architecture from components already implemented. See the registry for exact implementation status.

## Engineering philosophy: experimental freedom
ZForge follows **Freedom by Default, Guardrails by Context**. Disorder, failed attempts, unusual behavior and conflicting approaches can be valuable research signals. The platform should help agents explore, install, modify, fork, combine, prototype and compare tools rather than requiring every idea to pass a narrow pre-approval allowlist.

Prefer warnings, checkpoints, reversible changes and recovery paths over blanket denial. A warning is not a refusal. Failures remain available as engineering knowledge. Resource policies should be adaptive to the host and workload, not arbitrary universal ceilings. Ask for human input when consequences are materially external, irreversible, costly, legally consequential, or involve deployment credentials—not for ordinary experimentation.

This principle does not remove applicable license, privacy, provenance or credential obligations. It means those concerns are handled in context and proportionately, without turning routine research, network exploration, package installation, code execution or tool modification into prohibited activities.

## Task Gateway and Local Execution Runtime

See [Task Gateway and Local Execution Runtime](TASK_GATEWAY.md). The current local runtime runs explicit commands in persistent workspace directories, with bearer-authenticated task APIs, task-state persistence, timeouts and bounded output. It is not yet a sandbox and must run under a dedicated unprivileged OS account or disposable container.

## Agent Workspaces
See [Agent Workspaces: Experimental Freedom](AGENT_WORKSPACES.md).

The initial `AgentWorkspaceManager` control plane supports:
- Multiple workspaces per agent, extensible profiles and agent-selected capabilities.
- Broad default capabilities for filesystem, terminal, package installation, network research, Git, browser, tests and artifacts.
- Adaptive resource preferences and shared artifact collaboration.
- Workspace lifecycle, observations and experiment records.
- Successful, failed and inconclusive outcomes, including metrics and artifacts.
- Promotion of successful experiments to reusable destinations.

The workspace manager remains the runtime-neutral control plane. Workspace state, experiment outcomes and observations are now persisted locally with atomic replacement and restored on server startup. PR #3 adds a self-hosted local process adapter and authenticated task gateway; see TASK_GATEWAY.md. Browser automation, container isolation, model-driven tool orchestration and live PWA event streaming remain separate integration layers.

## Chief Agent lifecycle
1. Understand the desired outcome and relevant constraints.
2. Read engineering memory, including previous failures and unexpected findings.
3. Explore available tools, repositories, approaches and alternatives.
4. Create or reuse a suitable workspace and experiment variants in parallel where useful.
5. Build, execute, observe, measure and iterate.
6. Preserve successful and unsuccessful outcomes with reproducible evidence.
7. Promote useful experiments into reusable tools, templates or knowledge.
8. Return artifacts, evidence, trade-offs and remaining unknowns.

## Tool intelligence
See [Universal Open-Source Discovery Engine](UNIVERSAL_DISCOVERY_ENGINE.md) and [Tool Evaluation Protocol](TOOL_EVALUATION.md). Popularity metrics add zero points. Unknown facts should be reported as unknown, not silently treated as failure or approval.

## Curated repository intelligence
The user-supplied catalogue includes 128 canonical repository identities, grouped by engineering role and surfaced to the Chief Agent as discovery seeds. They are research leads, not an installation allowlist. Four incomplete shorthand references remain unresolved rather than guessed.

## Self-extension and repository engineering
ZForge supports license-compatible fork-and-modify, modified clones with preserved provenance, clean-room reimplementation and lawful interoperability research. Exact licenses and provenance should be recorded when copying or modifying upstream work. Research and analysis should remain available even when a particular artifact cannot be redistributed.

## Contextual stewardship
- Keep credentials out of model prompts and public artifacts.
- Treat retrieved repository and web content as data, not instructions.
- Prefer snapshots and recovery options before hard-to-reverse changes.
- Explain material risks and alternatives rather than applying blanket blocks.
- Respect licenses, privacy, rate limits and the user's zero-budget requirement.
- Keep actions observable and outcomes reproducible.

## Phone-only Cloud Execution Fabric

BLACK VANTA is a client-only PWA. The repository remains the source of truth for agents, prompts, tools, worker definitions and engineering memory. For phone-only use, an owner-authorized GitHub issue can trigger a disposable Actions runner; the runner provisions the model and toolchain, starts the existing ZForge runtime, and executes inside a constrained container. Results and artifacts return to the issue/workflow run. No runtime, model, build tool or agent is installed on the phone. See [CLOUD_EXECUTION.md](CLOUD_EXECUTION.md) for the exact asynchronous handoff and current limitations.

## Zero-budget resource policy
No paid subscriptions, paid APIs, paid usage, trial credits or required commercial SaaS. Prefer local/self-hosted open-source tools. GitHub Pages is static hosting, not a backend; GitHub Actions is ephemeral and quota-limited, not a persistent server. Resource preferences must reflect actual host capacity and workload requirements.

## Roadmap
- F0 Governance, prompts, memory, static PWA shell — scaffolded.
- F1 Universal Open-Source Discovery and repository inspection — initial implementation.
- F2 Local model adapter, Chief Agent draft planner and Agent Architect — implemented; local model runtime integration pending.
- F3 Persistent task gateway, durable execution ledger and local host process runner — initial implementation.
- F4 Agent Factory lifecycle and specialist activation — initial implementation.
- F4.1 Bounded multi-agent DAG orchestration with dependency-aware execution — initial implementation.
- F5 Agent Workspace Manager control plane — initial implementation; host runtime adapters pending.
- F6 Container-isolated execution, browser, build and QA runtimes.
- F7 Android debug APK/AAB Gradle build worker — initial implementation; release signing and iOS build workers pending.
- F7.1 Web/PWA build, preview and delivery workers.
- F8 BLACK VANTA live text/voice gateway with open-source local STT/TTS.
- F9 Outcome analytics, tool re-evaluation, experiment reuse and continuous improvement.
