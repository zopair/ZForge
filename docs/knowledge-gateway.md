# Blacksmith Knowledge Gateway

## Runtime contract

Web access is enabled by `config/agent-policies.json`. Each task receives one shared `GlobalApiBudget` with a hard ceiling of 20 HTTP requests. Blacksmith is allocated at most 12 requests; agents without an explicit allocation are denied. Every HTTP attempt and redirect consumes one unit. The budget records path-only request evidence and agent IDs, never query strings.

Blacksmith receives only `web_search` and `web_fetch` when its policy is enabled. Search is routed through configured HTTPS SearXNG instances using `/search?q=...&format=json`; only the first five results are returned as Markdown and are labelled unverified. Configure instances with the comma-separated `ZFORGE_SEARXNG_INSTANCES` environment variable. No arbitrary instance is selected automatically. Search terms are sent to third-party instance operators; do not submit secrets, private repository names, or confidential task details.

Public SearXNG JSON availability is not guaranteed. The upstream API documentation states that JSON output must be enabled by each instance operator and that many public instances disable it. If all configured instances fail or return HTML/challenge pages, search fails closed. Do not add instances without reviewing operator trust, TLS, uptime, JSON support and privacy implications.

Page reading uses Node's HTTP(S) client with DNS resolution pinned to a validated public address, redirect revalidation, response-size and timeout limits, Cheerio HTML parsing, and Turndown Markdown conversion. Page scripts are never executed. Page content is always untrusted evidence, not agent instructions.

## Network isolation

Gateway-only mode requires:

- `ZFORGE_EXECUTION_BACKEND=container`
- `ZFORGE_CONTAINER_NETWORK=none`

The runtime refuses to start when web access is enabled with local execution or bridged container networking. The Knowledge Gateway runs in the host service; agent commands run in a network-isolated container. Do not relax this guard while retaining the gateway-only policy.

## Dependencies

- `cheerio@1.2.0` — MIT, HTML parsing only; no page JavaScript execution.
- `turndown@7.2.4` — MIT, HTML-to-Markdown conversion.
- `searxng/searxng` — AGPL-3.0 upstream search engine; ZForge consumes its HTTP JSON API and does not embed or redistribute the server.

Dependencies are exact-version pinned in `package.json`. The repository currently has no package lockfile, so transitive dependency reproducibility remains an open follow-up and must not be described as fully locked.
