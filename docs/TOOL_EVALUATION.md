# Tool Evaluation Protocol

Find the strongest tool for a stated capability and workload, not the most popular tool.

## Discovery
Search by job-to-be-done, inputs/outputs, runtime, constraints, and failure tolerance. Search GitHub globally plus official registries and documentation. Compare alternatives across languages and architectures.

## Required evidence
Canonical source; exact version/commit; capability and workload; license; compatibility; free status/quotas; security advisories; installation footprint; reproducible test; environment; expected and observed outputs; benchmark metrics; failures; resource use; date; confidence; evidence links.

## Hard gates
Reject/quarantine incompatible licenses, unacceptable security risks, incompatible runtime, undisclosed paid dependencies, prohibited use, or no viable free path. Unknown license must be resolved before production use.

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

## Benchmark discipline
Define workload and success conditions first; pin versions/environment; use identical inputs; test correctness before speed; measure relevant CPU/RAM/storage/network/latency; include negative/security cases; publish reproducible scripts and raw evidence; record limitations and failed attempts.

## Status
VERIFIED = passed recorded tests in stated environment. CONDITIONAL = useful with constraints/incomplete evidence. CANDIDATE = discovered, untested. DEPRECATED = no longer preferred. REJECTED = failed gate or representative test.

"Best" is always scoped to a task, version, environment, and test.
