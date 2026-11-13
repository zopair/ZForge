# Agent Learnings

Template: date/agent/version; context; observation; evidence; lesson; proposed process/prompt change; regression test; promotion status.

## Verified principles
1. Popularity is not evidence of workload performance.
2. "Best" is scoped to capability, version, environment, and test.
3. Task prompts must be reversible; canonical instructions require evidence and regression tests.

## Hypotheses
None.


## 2026-11-13 — Strict evidence gates must remain strict
- Context: ZUOI toolchain composition CI.
- Observation: incomplete candidate fixtures were quarantined, causing composition tests to fail until fixtures declared evidence explicitly.
- Evidence: run 43365838634 (23 pass / 3 fail), corrected run 43365918610 (26 pass / 0 fail).
- Lesson: never relax license/security/dependency/runtime/version gates to satisfy tests; improve fixtures and evidence.
- Promotion: durable process lesson; no automatic policy relaxation.
