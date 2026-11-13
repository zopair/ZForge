# Tool Evaluation Protocol

Find the strongest tool for a stated capability and workload, not the most popular tool.

## Discovery
Search by job-to-be-done, inputs/outputs, runtime, target OS/architecture, constraints and failure tolerance. Use the Universal Open-Source Discovery Engine to search globally across GitHub, topics, official organizations and independent upstreams. Cover cloud/computing, GitHub engineering, full-stack, web, Android, Apple/iOS, AI/models, agents/MCP/skills, graphics/animation/VFX, Arabic/RTL/fonts/NLP/voice, audio/video/media, security, DevOps/QA, data engineering and developer tooling. Search by semantic behavior and interface, including Arabic/English synonyms. Vendor organizations (Google, Anthropic, Microsoft, Apple, Meta, xAI/X and GitHub) are discovery seeds, never quality endorsements.

## Non-negotiable zero-budget/open-source gates
- Code and every used dependency must have a recognized open-source license.
- Model weights, datasets, fonts, icons, templates and media assets need separately verified licenses.
- A local/self-hosted path must exist and be viable for the target hardware.
- No required paid API, SaaS, subscription, credits, commercial account or expiring trial.
- No undisclosed paid/closed control plane or mandatory network service.
- Security, lawful use, runtime compatibility and combined-license compatibility must pass.
- Unknown license, dependency, cost or compatibility is QUARANTINED; a confirmed violation is REJECTED.
- A public GitHub repository, free trial, or free tier does not establish open source or sustainable zero-cost operation.

## Required evidence
Canonical source; exact version/commit; full license text and subcomponent licenses; dependencies; capability and workload; offline/self-host proof; hosted-service dependencies; runtime/OS/architecture; security advisories; reproducible test; environment; expected and observed outputs; benchmark metrics; failures; resource use; date; confidence; evidence links.

## Weighted score (0–5 per criterion)
| Criterion | Weight |
|---|---:|
| Workload capability fit | 30 |
| Correctness and reliability | 20 |
| Evidence quality and test coverage | 15 |
| Integration and compatibility | 10 |
| Maintenance and release health | 10 |
| Cost, license, constraints | 10 |
| Resource efficiency | 5 |

Normalized score = Σ(score ÷ 5 × weight). Popularity metrics add zero points. Keep confidence low/medium/high separately and never compare unrelated categories.

## Toolchain compatibility
Check capability providers/requirements, version and runtime intersections, package pins, protocols, data formats, native libraries, OS/hardware, security boundaries, combined license obligations and resource ceilings. Use real package resolvers/lockfiles for version ranges. Do not certify an integrated stack based on separate project claims. Preserve the compatibility matrix and end-to-end test evidence.

## Benchmark discipline
Define workload and success conditions first; pin versions/environment; use identical inputs; test correctness before speed; measure relevant CPU/RAM/storage/network/latency; include negative/security cases; publish reproducible scripts and raw evidence; record limitations and failed attempts.

## Maintenance
Track official releases, tags, security advisories, license changes and archived status. Never silently upgrade. Propose updates, isolate them, run compatibility/security/regression tests, and preserve rollback. Major updates require explicit review.

## Status
VERIFIED = passed recorded tests in stated environment. CONDITIONAL = useful with constraints/incomplete evidence. CANDIDATE = discovered, untested. QUARANTINED = unknown hard gate. DEPRECATED = no longer preferred. REJECTED = failed gate or representative test.

"Best" is always scoped to a task, version, environment and test.