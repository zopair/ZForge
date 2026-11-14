# Browser Smoke Failure Playbook

This is a required diagnostic reference for ZForge browser-smoke failures. Read it before changing a selector, timeout, assertion, or browser-specific behavior.

## Non-negotiable triage sequence

1. Fetch the failed GitHub Actions job logs. A summary such as `Process completed with exit code 1` is not a diagnosis.
2. Record the exact browser name, failing source file and line, exception type, and awaited condition.
3. Identify the failing layer before editing:
   - application behavior,
   - test fixture/mock behavior,
   - browser engine behavior,
   - environment/dependency setup.
4. Compare the same step across Chromium, Firefox, and WebKit. A failure isolated to one engine is evidence to inspect browser-specific platform behavior and the test fixture before changing application code.
5. Inspect the real DOM status/error text and intercepted network method, URL, status, and preflight behavior. Do not replace a visible wait with a hidden-DOM wait or increase timeouts merely to make the test green.
6. Reproduce the underlying condition in the test fixture, add a regression assertion, then rerun the full browser matrix and unit tests.
7. Never skip a browser, weaken an assertion, or suppress a failure as a shortcut.

## Known regression: GitHub API mock CORS preflight

**Observed:** Chromium and Firefox pass, while WebKit times out waiting for GitHub authentication success in `scripts/browser-smoke.mjs`.

**Root cause:** The browser test mocks `https://api.github.com/**`, but a cross-origin request carrying the Authorization header can trigger a CORS `OPTIONS` preflight. A mock that only handles GET/POST is incomplete. Real GitHub API responses include CORS behavior; mocked responses must model it too. WebKit exposed the missing preflight handling.

**Required fixture behavior:**
- Handle `OPTIONS` before endpoint-specific routes and return HTTP 204.
- Include `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and optionally `Access-Control-Max-Age`.
- Include `Access-Control-Allow-Origin` on the mocked GET/POST responses as well.
- Explicitly allow the headers used by the app: `Accept`, `Authorization`, `Content-Type`, and `X-GitHub-Api-Version`.
- Assert that WebKit exercised the preflight path, so a future fixture regression cannot silently reappear.
- When authentication fails, capture and report the actual `#github-auth-status` text instead of waiting only for the success phrase until timeout.

## Known anti-patterns to avoid

- Treating every `.plan-approve-button` timeout as a plan UI defect without checking which browser and which earlier interaction failed.
- Treating every generic exit code 1 as the same recurring failure. Always inspect the latest job log; line numbers and root causes can change.
- Changing selectors, adding arbitrary sleeps, increasing timeouts, or removing assertions before establishing the failing layer.
- Assuming Playwright route mocks automatically behave like the real remote API, especially for CORS preflight and response headers.
- Declaring a fix complete before the complete browser matrix and unit tests pass.

## Verification standard

A browser-smoke repair is complete only when:
- unit tests pass;
- Chromium, Firefox, and WebKit pass;
- the relevant regression condition is asserted directly;
- the failure output contains enough context to identify the actual browser/status/endpoint if it regresses.
