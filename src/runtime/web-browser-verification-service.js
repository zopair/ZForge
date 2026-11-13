import { createServer } from 'node:http';

const OUTPUT_DIRECTORIES = new Set(['dist', 'build', 'out']);
const BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
]);

function validateProjectPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new TypeError('projectPath must be a relative project path inside the workspace');
  }
  const segments = value.split('/');
  if (segments.some(segment => segment === '..' || segment === '')) throw new TypeError('projectPath must be a relative project path inside the workspace');
  if (segments.some(segment => segment === '.') && value !== '.') throw new TypeError('projectPath must be normalized');
  return value;
}

function safeOutputPath(projectPath, outputDirectory) {
  if (!OUTPUT_DIRECTORIES.has(outputDirectory)) throw new TypeError('outputDirectory must be one of: dist, build, out');
  return projectPath === '.' ? outputDirectory : projectPath + '/' + outputDirectory;
}

function filePathForOutput(entryPath, outputPath) {
  const normalized = entryPath.replace(/\\/g, '/');
  if (normalized === outputPath || !normalized.startsWith(outputPath + '/')) return null;
  return normalized.slice(outputPath.length + 1);
}

function mimeType(path) {
  const dot = path.lastIndexOf('.');
  return MIME_TYPES.get(dot >= 0 ? path.slice(dot).toLowerCase() : '') ?? 'application/octet-stream';
}

export class WebBrowserVerificationService {
  constructor({ runtime, browserTypes = null, timeoutMs = 30000, maxEntries = 5000, maxAssetBytes = 50 * 1024 * 1024 } = {}) {
    if (!runtime || typeof runtime.listFiles !== 'function' || typeof runtime.readBuffer !== 'function') {
      throw new TypeError('runtime must support workspace file listing and reads');
    }
    if (browserTypes !== null && (!browserTypes || typeof browserTypes !== 'object')) throw new TypeError('browserTypes must be an object or null');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new RangeError('timeoutMs must be between 1000 and 120000');
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 5000) throw new RangeError('maxEntries must be between 1 and 5000');
    if (!Number.isInteger(maxAssetBytes) || maxAssetBytes < 1) throw new RangeError('maxAssetBytes must be positive');
    this.runtime = runtime;
    this.browserTypes = browserTypes;
    this.timeoutMs = timeoutMs;
    this.maxEntries = maxEntries;
    this.maxAssetBytes = maxAssetBytes;
  }

  async verify({
    workspaceId,
    projectPath = '.',
    outputDirectory = 'dist',
    browsers = ['chromium', 'firefox', 'webkit'],
    viewportWidth = 390,
    viewportHeight = 844,
  } = {}) {
    if (typeof workspaceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workspaceId)) throw new TypeError('workspaceId is invalid');
    const project = validateProjectPath(projectPath);
    const outputPath = safeOutputPath(project, outputDirectory);
    if (!Array.isArray(browsers) || browsers.length < 1 || browsers.length > 3 || browsers.some(name => !BROWSERS.has(name)) || new Set(browsers).size !== browsers.length) {
      throw new TypeError('browsers must contain unique names from chromium, firefox and webkit');
    }
    for (const [name, value] of Object.entries({ viewportWidth, viewportHeight })) {
      if (!Number.isInteger(value) || value < 240 || value > 4096) throw new RangeError(name + ' must be between 240 and 4096');
    }

    const entries = await this.runtime.listFiles({ workspaceId, path: outputPath, maxEntries: this.maxEntries });
    const files = new Map();
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      const relativePath = filePathForOutput(entry.path, outputPath);
      if (relativePath) files.set(relativePath, entry.path.replace(/\\/g, '/'));
    }
    if (!files.has('index.html')) throw new Error('built web output must contain index.html at its root');

    let browserTypes = this.browserTypes;
    if (!browserTypes) {
      try { browserTypes = await import('playwright'); }
      catch { return { status: 'unavailable', reason: 'Playwright is not installed on the runtime host.', workspaceId, projectPath: project, outputDirectory, summary: { total: browsers.length, passed: 0, failed: 0 }, browsers: [] }; }
    }

    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, 'http://127.0.0.1');
        let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        if (!relativePath) relativePath = 'index.html';
        if (relativePath.includes('\\0') || relativePath.includes('\\\\') || relativePath.split('/').some(segment => segment === '.' || segment === '..')) {
          response.writeHead(400, { 'Cache-Control': 'no-store' });
          return response.end('invalid path');
        }
        if (!files.has(relativePath) && !relativePath.includes('.')) relativePath = 'index.html';
        const sourcePath = files.get(relativePath);
        if (!sourcePath) {
          response.writeHead(404, { 'Cache-Control': 'no-store' });
          return response.end('not found');
        }
        const content = await this.runtime.readBuffer({ workspaceId, path: sourcePath, maxBytes: this.maxAssetBytes });
        response.writeHead(200, {
          'Content-Type': mimeType(relativePath),
          'Content-Length': content.length,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(content);
      } catch (error) {
        response.writeHead(error instanceof RangeError ? 413 : 500, { 'Cache-Control': 'no-store' });
        response.end('unable to read built asset');
      }
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const results = [];
    try {
      for (const name of browsers) {
        let browser;
        try {
          const browserType = browserTypes[name];
          if (!browserType || typeof browserType.launch !== 'function') throw new Error(name + ' Playwright browser is not available');
          browser = await browserType.launch({ headless: true });
          const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
          const pageErrors = [];
          const consoleErrors = [];
          const failedRequests = [];
          page.on('pageerror', error => pageErrors.push(String(error?.message ?? error)));
          page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(String(message.text()).slice(0, 500));
          });
          page.on('requestfailed', request => {
            if (request.url().startsWith(origin + '/')) failedRequests.push(request.url().slice(origin.length));
          });
          const response = await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: this.timeoutMs });
          const httpStatus = response?.status?.() ?? 0;
          const layout = await page.evaluate(() => ({
            title: document.title,
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement?.scrollWidth ?? 0,
            bodyWidth: document.body?.scrollWidth ?? 0,
            readyState: document.readyState,
          }));
          const horizontalOverflow = layout.documentWidth > viewportWidth + 1 || layout.bodyWidth > viewportWidth + 1;
          const passed = httpStatus >= 200 && httpStatus < 300
            && pageErrors.length === 0
            && consoleErrors.length === 0
            && failedRequests.length === 0
            && !horizontalOverflow;
          results.push({
            name,
            status: passed ? 'passed' : 'failed',
            httpStatus,
            title: layout.title,
            readyState: layout.readyState,
            viewportWidth: layout.viewportWidth,
            documentWidth: layout.documentWidth,
            horizontalOverflow,
            pageErrors,
            consoleErrors,
            failedRequests,
          });
          await page.close();
        } catch (error) {
          results.push({ name, status: 'failed', error: String(error?.message ?? error).slice(0, 1000) });
        } finally {
          if (browser) await browser.close().catch(() => {});
        }
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }

    const passed = results.filter(result => result.status === 'passed').length;
    const failed = results.length - passed;
    return {
      status: failed === 0 ? 'passed' : 'failed',
      workspaceId,
      projectPath: project,
      outputDirectory,
      viewport: { width: viewportWidth, height: viewportHeight },
      summary: { total: results.length, passed, failed },
      browsers: results,
    };
  }
}
