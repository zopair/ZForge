# Resource Limits and Cost Ledger

Template: provider/tool/plan; capability; pricing/free-tier source; quotas/reset; CPU/RAM/storage/network/CI; retention; concurrency/timeout; credentials; last checked; fallback.

## Policy
- Project budget: zero. No paid subscriptions, paid APIs, or paid usage.
- Prefer open-source/local tools and free official tiers.
- Verify quotas and terms before depending on hosted free tiers.
- Avoid redundant CI, unnecessary full clones, unbounded searches, and duplicate model calls.
- No provider quota has been independently verified in this scaffold.


## ZUOI discovery budgets (initial defaults)
- GitHub repository search is sequential; no burst concurrency.
- Maximum query batch: 8 queries/run without a token, 20 with an explicitly supplied token; the adapter itself caps one run at 30.
- Default results per query: 15; maximum configured result page is 100. Search pagination returns continuation pages when the requested result window is not yet filled.
- Vendor organization enumeration: 2 organizations/run, 100 repositories/page, with explicit page continuation.
- Default discovery cache TTL: 6 hours; current cache is process-local only and is lost when the runtime exits.
- Search adapter pagination is bounded; incomplete results are explicitly marked. Continuation offsets are required to cover the remaining query catalogue.
- On HTTP 403/429 rate-limit responses, stop immediately and wait for the official reset window. No token/account rotation or proxy bypass.
- These are ZForge safety budgets, not GitHub's provider quota promises. Revalidate GitHub's current documented limits before deployment.
