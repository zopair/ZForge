# Issues Log

Record observed failures, not guesses.

Template: ID/date; task/environment; exact error; expected behavior; reproduction; severity; root cause (confirmed/probable/unknown); evidence; tool/version; status; linked solution and regression test.

Runtime findings are recorded by the authenticated Engineering Issue Ledger at `ZFORGE_DATA_DIR/engineering-issues.json`. This Markdown file remains the human-readable, version-controlled incident history; do not claim that live runtime issues are empty unless the runtime ledger has been queried.

See [Unified Engineering Issue Ledger](../docs/ENGINEERING_ISSUE_LEDGER.md) for the record schema, lifecycle, API, evidence gates, and resource limits.


## ZF-001 — CI toolchain fixture gate failure (2026-11-13)
- Environment: GitHub Actions, Node.js 24.22.2, PR #1 merge commit d7d7c1b.
- Exact result: workflow run 43365838634; 23 passed, 3 failed.
- Failures: toolchain composition tests expected conflicts/compatibility but candidates were excluded before composition.
- Root cause: test fixture omitted explicit runtime, combined-license, license-text, dependency, security, maintenance and version attestations required by the new hard gates. The implementation correctly quarantined incomplete candidates.
- Root cause confidence: confirmed.
- Resolution: update fixtures to state verified gates explicitly; do not weaken production eligibility checks.
- Regression evidence: workflow run 43365918610 passed 26/26 tests.
- Status: resolved.
