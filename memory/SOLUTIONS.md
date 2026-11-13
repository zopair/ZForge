# Verified Solutions

Only record fixes that passed reproducible verification.

Template: ID/date; related issue; root cause; fix; environment/versions; verification command/test; result/evidence; regression protection; limitations.

No runtime solutions recorded.


## ZF-SOL-001 — Preserve strict candidate gates in toolchain tests (2026-11-13)
- Related issue: ZF-001.
- Root cause: incomplete test fixtures were incorrectly treated as eligible toolchain components.
- Fix: fixture now explicitly declares license text, dependency, combined-license, runtime, security, archive, maintenance and pinned-version evidence. Unknown values remain quarantined.
- Verification: GitHub Actions run 43365918610, Node.js 24.22.2; 26 passed, 0 failed.
- Regression protection: discovery-engine tests cover unknown evidence quarantine and compatible/incompatible composition.
- Limitation: these tests verify deterministic policy logic, not a real third-party dependency graph.
