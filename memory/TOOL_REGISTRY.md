# Tool Intelligence Registry

Canonical index of category-specific evaluations. Popularity is discovery-only and never a ranking input. No third-party project is approved merely because it appears in a search result.

## Status
- VERIFIED: passed recorded tests in a stated environment and pinned version.
- CONDITIONAL: useful with explicit constraints or incomplete evidence.
- CANDIDATE: discovered, not yet tested.
- QUARANTINED: one or more hard gates are unknown.
- DEPRECATED: no longer preferred.
- REJECTED: failed a hard gate or representative test.

## Internal discovery components (implementation status, not third-party approval)
| Component | Location | State | Evidence |
|---|---|---|---|
| Discovery taxonomy/query planner | src/core/discovery-engine.js | Implemented; CI passed 49/49 | test/discovery-engine.test.js |
| Bounded discovery orchestration/cache | src/core/discovery-service.js | Implemented; process-local cache only | test/discovery-service.test.js |
| Bounded discovery orchestration/cache | src/core/discovery-service.js | Implemented; process-local cache only; CI passed 39/39 | test/discovery-service.test.js |
| License classifier and eligibility gates | src/core/discovery-engine.js | Implemented; conservative allowlist | test/discovery-engine.test.js |
| Toolchain compatibility composer | src/core/discovery-engine.js | Implemented; basic capability/conflict graph | test/discovery-engine.test.js |
| GitHub public repository search | src/adapters/github-discovery.js | Implemented; read-only, rate-limit-aware, includes public organization enumeration | test/github-discovery.test.js |
| Repository metadata/license/manifest inspection | src/adapters/github-repository-inspector.js | Implemented; no code execution; manual review still required | test/github-repository-inspector.test.js |
| Official GitHub release metadata | src/adapters/github-release-monitor.js | Implemented; read-only | test/github-release-monitor.test.js |
| Release update review | src/core/release-monitor.js | Implemented; review-only, no auto-upgrade | test/discovery-engine.test.js |
| Local Ollama model adapter | src/adapters/ollama-model-adapter.js | Implemented; loopback-only; model license checked separately | test/ollama-model-adapter.test.js |
| Chief Agent draft planner | src/core/chief-agent.js | Implemented; memory + discovery + local model; no execution or repository writes | test/chief-agent.test.js |
| Agent Architect manifest/activation gates | src/core/agent-architect.js | Implemented; activation always requires independent approval | test/agent-architect.test.js |
| Local model admission registry | memory/MODEL_REGISTRY.md | Created; no checkpoint approved or benchmarked | docs/MODEL_RUNTIME_POLICY.md |
| Local repository memory/prompt provider | src/adapters/local-repository-memory-store.js | Implemented; bounded read-only local filesystem access | test/local-repository-memory-store.test.js |
| GitHub task branch/file writer | src/adapters/github-repository-writer.js | Implemented; server token + approval verifier + task-branch-only | test/github-repository-writer.test.js |\n| Local Ollama model adapter | src/adapters/ollama-model-adapter.js | Implemented; loopback-only; model license checked separately | test/ollama-model-adapter.test.js |\n| Chief Agent draft planner | src/core/chief-agent.js | Implemented; memory + discovery + local model; no execution or repository writes | test/chief-agent.test.js |\n| Agent Architect manifest/activation gates | src/core/agent-architect.js | Implemented; activation always requires independent approval | test/agent-architect.test.js |
| Chief Agent / Agent Architect policies | prompts/ | Updated; runtime not connected | docs/ARCHITECTURE.md |
| Black Phantom UI | index.html, assets/app.css, assets/app.js | Static Arabic RTL visual shell implemented; voice/chat runtime not connected | docs/BLACK_PHANTOM_UI.md |

## Third-party registry
No third-party tools have been benchmarked and approved in this update. Do not invent winners or assign VERIFIED status without reproducible evidence.

| Capability | Project | Version | Status | License gate | Self-hosted / zero-cost proof | Benchmark | Confidence |
|---|---|---|---|---|---|---|---|
| Agent orchestration | LangGraph | TBD | CANDIDATE | Pending exact component/license check | Pending | Not run | LOW |
| Typed agent SDK | Pydantic AI | TBD | CANDIDATE | Pending | Pending | Not run | LOW |
| Coding agent execution | OpenHands SDK | TBD | CANDIDATE | Pending dependencies/sandbox check | Pending | Not run | LOW |
| Local model runtime | Ollama / llama.cpp | TBD | CANDIDATE | Pending pinned release review | Pending hardware tests | Not run | LOW |
| Browser testing | Playwright | TBD | CANDIDATE | Pending pinned release review | Pending | Not run | LOW |
| Prompt evaluation | Promptfoo | TBD | CANDIDATE | Pending full license/dependency review | Local-only path pending | Not run | LOW |
| Full-stack builder | Dyad | TBD | CANDIDATE | Mixed directory licensing requires review | Pending | Not run | LOW |
| Full-stack builder | Singulary | TBD | CANDIDATE | Pending current source/license verification | Pending | Not run | LOW |
| Backend | PocketBase | TBD | CANDIDATE | Pending pinned release/dependency review | Self-host path to test | Not run | LOW |
| Backend platform | Supabase | TBD | CANDIDATE | Component-by-component review | Self-host resource profile pending | Not run | LOW |
| Visual editor | Onlook | TBD | CANDIDATE | Pending | Pending | Not run | LOW |

These entries are research leads from prior exploration, not endorsements. Revalidate current repository, version, license text, dependency tree, free/self-hosted path and maintenance status before use.

## Discovery coverage backlog
Cloud/computing; GitHub APIs/Actions/Apps; full-stack; web/PWA; Android/NDK/Gradle/signing; Apple/iOS; AI models/inference; agents/MCP/skills; graphics/3D/animation/VFX; Arabic/RTL/fonts/NLP/voice; audio/video; security/supply-chain; DevOps/QA; data engineering; developer tooling; media production.

## Evaluation queue
1. Full license-text, dependency and hosted-service inspection.
2. Sandboxed execution and test orchestration.
3. Semantic search breadth, pagination, caching and rate-limit tests.
4. Toolchain version/package/license compatibility.
5. PWA frontend and Black Phantom interaction.
6. Android build, signing, artifact verification.
7. Agent orchestration and structured memory.
8. Security and software supply-chain analysis.

Each evaluation adds a dated evidence record under memory/tool-evaluations/.
