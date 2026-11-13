# Browser QA

The browser smoke suite runs against the real BLACK VANTA static files served over localhost and verifies the primary user-facing path in Chromium, Firefox and WebKit.

## Covered flow

1. Load the application and assert its title and Arabic RTL document direction.
2. Connect to a deterministic in-test Task Gateway fixture.
3. Discover a local model and agent inventory.
4. Submit a chat task and verify the completed result is rendered.
5. Trigger the Web Build UI, verify the completion message and artifact link.
6. Check mobile viewport layout for horizontal overflow and a visible composer.
7. Fail on browser page exceptions or console errors.

The suite does not use a paid browser cloud or external test service. Playwright is installed only in the ephemeral GitHub Actions runner; it is not a production runtime dependency. The gateway responses are deterministic fixtures, so this suite verifies browser integration and UI behavior, not a live Ollama inference, production voice-model quality or a production server connection. A separate web-build integration test runs actual npm test/build scripts through LocalExecutionRuntime and verifies the published artifact's bytes and SHA-256 metadata.

Run locally after installing Playwright and its three browser engines:

```sh
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium firefox webkit
node scripts/browser-smoke.mjs
```
