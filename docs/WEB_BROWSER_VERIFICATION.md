# Generated Web App Browser Verification

The Web Browser Verification Worker opens the generated static web application itself in real browser engines. It is a separate stage after the Web Build Worker: a successful build is not treated as proof of browser compatibility.

## Runtime requirement

Install the open-source Playwright package and browser engines on the self-hosted runtime host. This is optional and never installed or downloaded automatically by ZForge:

```sh
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium firefox webkit
```

If Playwright or a requested browser is unavailable, the result is reported as unavailable/inconclusive or failed; it is never reported as a pass. GitHub Actions installs the pinned Playwright runner and all three browser engines in its ephemeral CI worker for repository tests.

## What is verified

- The built output contains a root `index.html`.
- The static preview server can serve the generated files from the selected workspace output directory.
- The page returns a successful HTTP status in each selected engine.
- Browser page exceptions, console errors and failed local asset requests are collected.
- Mobile viewport overflow is checked using document and body scroll widths.
- The report records browser name, HTTP status, page title, viewport, errors and pass/fail state.

The preview server binds to loopback only and serves only files enumerated under the selected `dist`, `build` or `out` directory. It does not modify the project or install dependencies. The page executes the project's generated JavaScript as a normal browser preview; application code may still make its own external network requests.

## API

`POST /api/tasks/:id/web-verify`

Requires bearer authentication and `{ "confirmExecution": true }`. Optional fields:

- `projectPath`: relative project directory, default `.`.
- `outputDirectory`: `dist`, `build` or `out`, default `dist`.
- `browsers`: unique subset of `chromium`, `firefox`, `webkit`; defaults to all three.
- `viewportWidth` / `viewportHeight`: default 390 × 844.

## Verification boundary

This stage is an automated smoke check, not a substitute for product-specific acceptance tests, accessibility audits, security review, visual regression baselines or manual device testing. Add project-owned tests for business behavior and critical user journeys. The CI browser suite also runs a generated sample app through this service in actual Chromium, Firefox and WebKit instances.
