# Discovery Run Ledger

Record bounded discovery runs and preserve enough evidence to avoid redundant searches.

## Run template
- Run ID / UTC timestamp:
- User task / workload:
- Capability queries:
- Domain coverage:
- Vendor organization seeds:
- GitHub API pages/results and completeness:
- Rate-limit headers/reset:
- Cache hits/misses and TTL:
- Candidate repository IDs and canonical URLs:
- License and dependency inspection status:
- Quarantined/rejected candidates and reasons:
- Selected candidates for testing:
- Resource use and API calls:
- Follow-up actions:
- Operator/agent version:

## Rules
- Never record access tokens or secret values.
- Do not claim full search coverage when query/page budgets truncated results.
- Search metadata and popularity are discovery metadata only.
- Store canonical repository IDs to deduplicate renames and forks.
- Re-run searches when requirements change, evidence expires, a security advisory appears, or the cache TTL expires—not merely to inflate result counts.

## Current state
No production discovery run has been executed from the ZForge runtime yet. Initial implementation and tests are being added in the feature branch.
