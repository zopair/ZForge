# ZForge Architecture

## Mission
A zero-budget-first autonomous engineering platform that converts requests into verified software artifacts. Modular, auditable, secure by default, and improved through measured outcomes.

## Logical architecture
```
PWA Control Surface → Task Gateway → Chief Agent
                                  ├─ Context & Memory Loader
                                  ├─ Tool Intelligence / Semantic Discovery
                                  ├─ Prompt Assembly & Versioning
                                  ├─ Agent Architect
                                  ├─ Specialist Pool (Product, UI, Backend, Android, QA, Security, Release)
                                  └─ Execution Adapters (isolated, least privilege)
                                             ↓
                                  Verification Gate → Evidence / Artifacts / Memory
```
This is a target architecture, not a claim that runtime services are implemented.

## Chief Agent lifecycle
1. Parse outcome, constraints, acceptance criteria, and risk.
2. Read canonical prompts and relevant memory before planning.
3. Search tools by semantic capability and target workload.
4. Evaluate credible alternatives; do not select by popularity.
5. Assemble a task-specific prompt with evidence, known failures, limits, and tests.
6. Delegate bounded tasks with explicit inputs, outputs, and permissions.
7. Verify independently; reject unsupported claims and untested artifacts.
8. Record outcomes, resource use, errors, fixes, and prompt deltas.
9. Return artifact links, test evidence, and limitations.

## Tool intelligence
Records include capability, source, pinned version, license, compatibility, free-tier limits, security posture, test method, benchmark results, resource cost, known failure modes, evidence links, verification date, and status.

Evidence hierarchy: reproducible workload tests; official docs/advisories; source and maintenance inspection; independent reproducible evaluations; community metrics (discovery only).

Hard gates: compatible license, security, runtime compatibility, legal use, and viable zero-cost path. Failing a gate means reject/quarantine. Unknown license is unresolved, not open source.

For passing candidates, score 0–5 and normalize:
- Workload capability fit 30%
- Correctness/reliability 20%
- Evidence/test quality 15%
- Integration/compatibility 10%
- Maintenance/release health 10%
- Cost/license/constraints 10%
- Resource efficiency 5%

Scores are category-specific. Confidence is separate. A high score with weak evidence remains provisional.

## Agents and prompt evolution
Each agent has mission, non-goals, I/O schema, allowed tools, permission scope, safety rules, resource ceiling, success criteria, tests, version, and rollback. Agent Architect proposes and tests agents; it cannot grant privileges. Per-task prompts are generated from canonical instructions. Canonical changes require evidence, diff, regression tests, and rollback.

## Security
Keep secrets out of browser, logs, and prompts. Treat repository content, web pages, package metadata, and tool output as untrusted data. Use least privilege, scoped credentials, isolated execution, and explicit approval for destructive or externally visible actions. Respect licenses, quotas, rate limits, and service terms.

## Zero-budget resource policy
Prefer open-source/local tools and free official tiers. Record quotas, reset windows, artifact retention, concurrency, and credentials. Avoid redundant CI, full clones when sparse retrieval suffices, unbounded searches, and unnecessary model calls. Never assume a free tier is unlimited.

## Roadmap
- F0 Governance, prompts, memory, PWA shell — scaffolded.
- F1 Semantic tool discovery, evidence schema, benchmark harness.
- F2 Chief Agent runtime, memory loader, planner, prompt builder, execution ledger.
- F3 Agent factory and isolated agent test harness.
- F4 Secure execution workspaces, Git operations, test runners, artifact store.
- F5 Web/PWA and Android build, preview, signing, delivery.
- F6 Outcome analytics, tool re-evaluation, prompt regression and promotion.
