import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve('.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
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

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
      await page.route('http://runtime.local/**', async route => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'ok' } });
        if (url.pathname === '/api/models') return route.fulfill({ json: { models: ['qwen3:8b'] } });
        if (url.pathname === '/api/agents') return route.fulfill({ json: { agents: [] } });
        if (url.pathname === '/api/tasks' && method === 'POST') return route.fulfill({ status: 201, json: { id: '12345678-1234-4234-8234-123456789012', status: 'queued' } });
        if (url.pathname.endsWith('/agent-run')) return route.fulfill({ json: { id: '12345678-1234-4234-8234-123456789012', status: 'succeeded', result: { completed: true, summary: 'Browser smoke task verified', steps: 2, evidence: [] } } });
        if (url.pathname.endsWith('/web-build')) return route.fulfill({ json: { id: '12345678-1234-4234-8234-123456789012', status: 'succeeded', result: { status: 'succeeded', manager: 'npm', artifacts: [{ id: 'artifact-web-1', filename: 'index.html', sizeBytes: 512 }] } } });
        if (url.pathname.endsWith('/android-build')) return route.fulfill({ json: { status: 'succeeded', result: { status: 'succeeded', artifacts: [] } } });
        return route.fulfill({ status: 404, json: { error: 'not_found' } });
      });
      await page.goto(origin, { waitUntil: 'networkidle' });
      assert.match(await page.title(), /BLACK VANTA/);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      await page.locator('#runtime-settings summary').click();
      await page.locator('#runtime-url').fill('http://runtime.local');
      await page.locator('#runtime-token').fill('browser-test-token-123456');
      await page.locator('#connect-runtime').click();
      await page.getByText(/تم الاتصال بالمحرك/).waitFor();
      await page.locator('#chat-input').fill('اختبر تطبيق الويب');
      await page.locator('#send-button').click();
      await page.getByText(/Browser smoke task verified/).waitFor();
      await page.locator('#web-build-button').click();
      await page.getByText(/اكتمل بناء تطبيق الويب/).waitFor();
      assert.equal(await page.locator('.artifact-link').count(), 1);
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        composerVisible: !!document.querySelector('.composer')?.getBoundingClientRect().width,
      }));
      assert.ok(layout.composerVisible, name + ': composer should be visible');
      assert.ok(layout.scroll <= layout.viewport + 1, name + ': mobile layout should not overflow horizontally');
      assert.deepEqual(pageErrors, [], name + ': browser console and page errors should be empty');
      await page.close();
      process.stdout.write(name + ': BLACK VANTA connection, task execution, web build UI and mobile RTL layout passed\n');
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
