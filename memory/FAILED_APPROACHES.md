# Failed Approaches

Record attempted approaches that demonstrably failed, why they failed, and what would need to change before retry.

Template: ID/date; intended outcome; approach; environment; observed failure; root-cause confidence; evidence; retry condition; better alternative.

No failed implementation approaches recorded yet.


## 2026-11-13 — Treating incomplete tool fixtures as eligible
- Intended outcome: verify toolchain conflict detection.
- Approach: use repository candidate fixtures without explicit evidence for all mandatory gates.
- Observed failure: composition excluded every fixture as QUARANTINED, so conflict assertions had no eligible components.
- Root cause: confirmed test-fixture omission, not a defect in the hard-gate policy.
- Retry condition: provide explicit evidence attestations for test candidates.
- Better alternative: keep strict gates and make test evidence explicit.
- Evidence: CI run 43365838634 failed 3 tests; corrected run 43365918610 passed 26/26.
