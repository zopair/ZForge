# Official GitHub tooling in ZForge discovery

## Runtime boundary

- `@octokit/rest@22.0.1` is the only GitHub REST client used by discovery adapters.
- `@octokit/plugin-throttling@11.0.5` detects primary and secondary rate limits. Both callbacks fail closed; ZForge does not retry after a rate-limit signal.
- `GlobalApiBudget` is injected into one `GitHubApiClient` shared by discovery and repository inspection. The initial `GET /rate_limit` preflight is counted, as is every subsequent GET.
- Octokit automatic retries are disabled so the request ceiling cannot be silently exceeded by retry attempts.
- Every outbound adapter call is GET-only. No repository code, package scripts, or install scripts are executed.
- A response showing less than 10% remaining quota halts later work; a preflight below the threshold prevents the data request.

## GitHub Actions context and cursor

`@actions/core` and `@actions/github` are used by `scripts/discovery-action-context.mjs` to read workflow context and token/budget inputs, expose safe outputs, and use action-lifecycle state. The durable `discovery_cursor.json` file is written atomically; `GITHUB_STATE` is not treated as cross-run storage.

## GitHub CLI

The `gh` CLI is appropriate for interactive operator diagnostics and one-off shell inspection. It is intentionally not used inside the budgeted discovery adapter path: a subprocess request would be opaque to the in-memory shared request ledger and could invalidate the hard request ceiling. Discovery and inspection therefore use Octokit through the single budget boundary.

## Supply-chain posture

The four direct packages are official GitHub-maintained projects, pinned to exact versions and MIT-licensed. CI installs with lifecycle scripts disabled and runs npm's default audit during install. There is no package lockfile in the existing repository; dependency versions are pinned directly until a lockfile can be generated and reviewed in a network-enabled build environment.
