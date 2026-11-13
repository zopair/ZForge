import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { WebBrowserVerificationService } from '../src/runtime/web-browser-verification-service.js';

const root = resolve('.');
let progressPolls = 0;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  const parsed = new URL(request.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(parsed.pathname);
  const json = (payload, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(payload));
  };
  if (pathname.startsWith('/api/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') { for await (const _chunk of request) {} }
    if (pathname === '/api/health') return json({ status: 'ok' });
    if (pathname === '/api/models') return json({ models: ['qwen3:8b'] });
    if (pathname === '/api/agents') return json({ agents: [] });
    if (pathname === '/api/voice/capabilities') return json({ capabilities: { transcription: true, synthesis: true, localOnly: true, engines: { transcription: 'whisper.cpp', synthesis: 'Piper', kemetone: false, piper: true }, checks: { whisperExecutable: true, whisperModel: true, ffmpegExecutable: true, piperInterpreter: true, piperModule: true, piperModel: true, piperConfig: true, piperReady: true, kemetoneConfigured: true, kemetonePython: true, kemetoneEspeak: false, kemetoneModel: true, kemetoneModule: false, kemetoneReady: false }, issues: ['espeak-ng is required by KemeTone', 'KemeTone Python dependencies are not installed in the configured interpreter'] } });
    if (pathname === '/api/voice/transcribe') return json({ text: 'recognized local speech', engine: 'whisper.cpp', local: true });
    if (pathname === '/api/voice/synthesize') { response.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); return response.end(Buffer.from('RIFF0000WAVEdata')); }
    if (pathname.endsWith('/events')) { progressPolls += 1; if (progressPolls === 1) return json({ taskId: '12345678-1234-4234-8234-123456789012', status: 'running', cursor: 1, events: [] }); return json({ taskId: '12345678-1234-4234-8234-123456789012', status: 'succeeded', cursor: 4, events: [{ sequence: 2, type: 'agent.task.started', details: { taskId: 'research', agentId: 'researcher' } }, { sequence: 3, type: 'agent.step.started', details: { step: 1 } }, { sequence: 4, type: 'agent.task.completed', details: { taskId: 'research', agentId: 'researcher' } }] }); }
    if (pathname === '/api/tasks' && request.method === 'POST') return json({ id: '12345678-1234-4234-8234-123456789012', status: 'queued' }, 201);
    if (pathname.endsWith('/agent-run')) { await new Promise(resolve => setTimeout(resolve, 250)); return json({ id: '12345678-1234-4234-8234-123456789012', status: 'succeeded', result: { completed: true, summary: 'Browser smoke task verified', steps: 2, evidence: [] } }); }
    if (pathname.endsWith('/web-build')) return json({ id: '12345678-1234-4234-8234-123456789012', status: 'succeeded', result: { status: 'succeeded', manager: 'npm', artifacts: [{ id: 'artifact-web-1', filename: 'index.html', sizeBytes: 512 }] } });
    if (pathname.endsWith('/web-verify')) return json({ id: '12345678-1234-4234-8234-123456789012', status: 'succeeded', result: { status: 'passed', summary: { total: 3, passed: 3, failed: 0 }, browsers: [{ name: 'chromium', status: 'passed', httpStatus: 200, title: 'Generated app' }, { name: 'firefox', status: 'passed', httpStatus: 200, title: 'Generated app' }, { name: 'webkit', status: 'passed', httpStatus: 200, title: 'Generated app' }] } });
    if (pathname.endsWith('/android-build')) return json({ status: 'succeeded', result: { status: 'succeeded', artifacts: [] } });
    return json({ error: 'not_found' }, 404);
  }
  try {
    const relativePath = pathname === '/' ? '/index.html' : pathname;
    const target = resolve(root, '.' + relativePath);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('path outside app root');
    const content = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = 'http://127.0.0.1:' + server.address().port;
const landing = await fetch(origin);
const landingHtml = await landing.text();
assert.equal(landing.status, 200, 'static app should return HTTP 200: ' + landingHtml.slice(0, 200));
assert.ok(landingHtml.includes('<title>BLACK VANTA | ZForge</title>'), 'static app response should contain the BLACK VANTA title');

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({ headless: true, args: name === 'chromium' ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [] });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, permissions: name === 'chromium' ? ['microphone'] : [] });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
;
      const navigation = await page.goto(origin, { waitUntil: 'networkidle' });
      assert.equal(navigation?.status(), 200, name + ': app document should return HTTP 200');
      assert.match(await page.title(), /BLACK VANTA/);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      await page.locator('#runtime-settings > summary').click();
      await page.locator('#runtime-url').fill(origin);
      await page.locator('#runtime-token').fill('browser-test-token-123456');
      await page.locator('#connect-runtime').click();
      await page.getByText(/تم الاتصال بالمحرك/).waitFor();
      await page.locator('#voice-enabled').check();
      await page.locator('#voice-diagnostics summary').click();
      const voiceDiagnostics = await page.locator('#voice-diagnostics').innerText();
      assert.match(voiceDiagnostics, /KemeTone/);
      assert.match(voiceDiagnostics, /espeak-ng is required by KemeTone/);
      assert.match(voiceDiagnostics, /Piper.*جاهز/);
      await page.locator('#chat-input').fill('اختبر تطبيق الويب');
      await page.locator('#send-button').click();
      await page.getByText(/Browser smoke task verified/).waitFor();
      await page.locator('.agent-progress-event').first().waitFor({ timeout: 10000 });
      assert.ok(await page.locator('.agent-progress-event').count() >= 3, name + ': specialist lifecycle and step events should be rendered');
      assert.ok((await page.locator('#agent-progress-feed').innerText()).includes('researcher'), name + ': specialist identity should be visible in the live feed');
      await page.locator('.voice-output').waitFor({ timeout: 10000 });
      await page.locator('#web-build-button').click();
      await page.getByText(/اكتمل بناء تطبيق الويب/).waitFor();
      assert.equal(await page.locator('.artifact-link').count(), 1);
      await page.locator('#web-verify-button').click();
      await page.getByText(/اجتاز التطبيق اختبارات المتصفح: 3 من 3/).waitFor();
      assert.ok((await page.locator('#conversation').innerText()).includes('webkit: passed'));
      if (name === 'chromium') {
        await page.locator('#voice-record-button').click();
        await page.waitForTimeout(350);
        await page.locator('#voice-record-button').click();
        await page.waitForFunction(() => document.getElementById('chat-input').value === 'recognized local speech', null, { timeout: 10000 });
        assert.equal(await page.locator('.voice-output').count(), 1);
      }
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        composerVisible: !!document.querySelector('.composer')?.getBoundingClientRect().width,
      }));
      assert.ok(layout.composerVisible, name + ': composer should be visible');
      assert.ok(layout.scroll <= layout.viewport + 1, name + ': mobile layout should not overflow horizontally');
      assert.deepEqual(pageErrors, [], name + ': browser console and page errors should be empty');
      await context.close();
      process.stdout.write(name + ': BLACK VANTA connection, task execution, web build UI and mobile RTL layout passed\n');
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}

const previewFiles = {
  'dist/index.html': Buffer.from('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generated App QA</title><link rel="stylesheet" href="/assets/app.css"></head><body><main id="app"><h1>Generated application preview</h1></main><script src="/assets/app.js"></script></body></html>'),
  'dist/assets/app.css': Buffer.from('html,body{margin:0;padding:0}main{max-width:100%;padding:16px}h1{font-size:24px}'),
  'dist/assets/app.js': Buffer.from("document.getElementById('app').dataset.ready='true';"),
};
const previewRuntime = {
  listFiles: async () => Object.keys(previewFiles).map(path => ({ path, type: 'file' })),
  readBuffer: async ({ path }) => {
    if (!previewFiles[path]) throw new Error('preview fixture file not found: ' + path);
    return previewFiles[path];
  },
};
const verifier = new WebBrowserVerificationService({
  runtime: previewRuntime,
  browserTypes: { chromium, firefox, webkit },
  timeoutMs: 20000,
});
const verification = await verifier.verify({
  workspaceId: 'browser-smoke-workspace',
  projectPath: '.',
  outputDirectory: 'dist',
  browsers: ['chromium', 'firefox', 'webkit'],
  viewportWidth: 390,
  viewportHeight: 844,
});
assert.equal(verification.status, 'passed', 'generated web preview should pass all engines: ' + JSON.stringify(verification));
assert.deepEqual(verification.summary, { total: 3, passed: 3, failed: 0 });
process.stdout.write('generated web app preview: Chromium, Firefox and WebKit passed\\n');
