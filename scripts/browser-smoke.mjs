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
    if (pathname === '/api/capabilities') return json({ capabilities: [{ id: 'conversation', label: 'الحوار', status: 'available' }] });
    if (pathname === '/api/conversation' && request.method === 'POST') return json({ conversationId: '12345678-1234-4234-8234-123456789099', mode: 'plan', intent: 'engineering_request', reply: 'تم إعداد خطة اختبارية ولم يبدأ التنفيذ.', taskId: '12345678-1234-4234-8234-123456789012', approvedPlan: '{"plan":"Browser smoke approved plan"}', approvedPlanSha256: 'a'.repeat(64), requiresApproval: true, executionStarted: false });
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
assert.ok(landingHtml.includes('<title>ZForge | BLACK VANTA</title>'), 'static app response should use ZForge identity with BLACK VANTA theme');

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
      let createdCloudIssue = null;
      await page.route('https://api.github.com/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/user') return route.fulfill({ json: { login: 'zopair' } });
        if (url.pathname === '/repos/zopair/ZForge' && request.method() === 'GET') {
          return route.fulfill({ json: { permissions: { push: true, admin: false } } });
        }
        if (url.pathname === '/repos/zopair/ZForge/issues' && request.method() === 'POST') {
          createdCloudIssue = request.postDataJSON();
          return route.fulfill({ status: 201, json: { number: 314, title: createdCloudIssue.title } });
        }
        if (url.pathname === '/repos/zopair/ZForge/issues/314/comments') {
          const correlation = createdCloudIssue?.title?.match(/\\[ZForgeChat:([a-f0-9-]{36})\\]/i)?.[1];
          return route.fulfill({ json: correlation ? [{ body: '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + correlation + ' -->\\nDirect cloud chat reply verified.' }] : [] });
        }
        return route.fulfill({ status: 404, json: { message: 'unexpected GitHub API request' } });
      });
      await page.locator('#github-settings > summary').click();
      await page.locator('#github-token').fill('github_pat_browser_test_token');
      await page.locator('#github-connect').click();
      await page.getByText(/تم ربط @zopair/).waitFor({ timeout: 5000 });
      await page.locator('#chat-input').fill('Build a sample PWA');
      await page.locator('#send-button').click();
      await page.getByText('Direct cloud chat reply verified.').waitFor({ timeout: 5000 });
      assert.ok(createdCloudIssue, name + ': cloud chat should create a GitHub issue automatically');
      assert.match(createdCloudIssue.title, /^\\[ZForge Cloud Task\\]/, name + ': cloud task issue title should carry the execution prefix');
      assert.match(createdCloudIssue.title, /\\[ZForgeChat:[a-f0-9-]{36}\\]/i, name + ': cloud task issue title should carry a reply correlation id');
      assert.equal(createdCloudIssue.body, 'Build a sample PWA\\n\\n<!-- Created automatically by BLACK VANTA cloud chat. -->', name + ': cloud task body should preserve the user request without the token');
      assert.equal(await page.locator('#github-token').inputValue(), '', name + ': token field should be cleared after successful connection');
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      const visualContract = await page.evaluate(() => {
        const style = selector => getComputedStyle(document.querySelector(selector));
        const panel = document.querySelector('.chat-panel');
        const panelRect = panel.getBoundingClientRect();
        const send = style('#send-button');
        const arrow = style('#send-button svg');
        return {
          pageBackground: style('body').backgroundColor,
          documentBackground: style('html').backgroundColor,
          panelVisible: panelRect.width > 0 && panelRect.height > 0 && panelRect.top >= 0 && panelRect.bottom <= innerHeight,
          composerInFirstViewport: (() => { const rect = document.querySelector('.composer').getBoundingClientRect(); return rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight; })(),
          messageTextColor: style('.message-content p').color,
          inputTextColor: style('#chat-input').color,
          panelAnimation: style('.chat-panel').animationName,
          composerBorder: style('.composer').borderTopWidth,
          sendShape: send.borderRadius,
          sendBackground: send.backgroundColor,
          arrowColor: arrow.stroke,
        };
      });
      assert.equal(visualContract.pageBackground, 'rgb(0, 0, 0)', name + ': BLACK VANTA body must be true black');
      assert.equal(visualContract.documentBackground, 'rgb(0, 0, 0)', name + ': document canvas must be true black');
      assert.equal(visualContract.panelVisible, true, name + ': complete chat window must fit in the first mobile viewport');
      assert.equal(visualContract.composerInFirstViewport, true, name + ': composer and send button must fit in the first mobile viewport');
      assert.equal(visualContract.messageTextColor, 'rgb(255, 255, 255)', name + ': conversation text must be white');
      assert.equal(visualContract.inputTextColor, 'rgb(255, 255, 255)', name + ': composer text must be white');
      assert.equal(visualContract.panelAnimation, 'vanta-border-flow', name + ': chat frame must have animated gold glow');
      assert.notEqual(visualContract.composerBorder, '0px', name + ': composer must have a visible frame');
      assert.equal(visualContract.sendShape, '50%', name + ': send control must be circular');
      assert.equal(visualContract.sendBackground, 'rgb(217, 173, 85)', name + ': send control must be gold');
      assert.equal(visualContract.arrowColor, 'rgb(255, 255, 255)', name + ': send arrow must be white');
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
      await page.locator('.plan-approve-button').waitFor({ timeout: 10000 });
      assert.ok((await page.locator('#conversation').innerText()).includes('تم إعداد خطة اختبارية ولم يبدأ التنفيذ.'), name + ': engineering requests should produce a plan before execution');
      assert.ok((await page.locator('#conversation').innerText()).includes('بصمة الخطة SHA-256'), name + ': plan approval must display its immutable fingerprint');
      await page.locator('.plan-approve-button').click();
      await page.getByText(/Browser smoke task verified/).waitFor();
      await page.locator('.agent-progress-event').first().waitFor({ timeout: 10000 });
      assert.ok(await page.locator('.agent-progress-event').count() >= 3, name + ': specialist lifecycle and step events should be rendered');
      const progressFeed = await page.locator('#agent-progress-feed').innerText();
      assert.match(progressFeed, /أحد الوكلاء الداخليين/, name + ': internal agent lifecycle should be summarized through ZForge');
      assert.match(progressFeed, /الوكيل ينفذ الخطوة/, name + ': execution step progress should be visible');
      assert.doesNotMatch(progressFeed, /researcher|agentId|taskId/, name + ': internal agent identifiers must not leak into the user-facing feed');
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
