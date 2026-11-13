import test from 'node:test';
import assert from 'node:assert/strict';
import { WebBrowserVerificationService } from '../src/runtime/web-browser-verification-service.js';

function browserHarness({ status = null, layout = { title: 'Generated app', viewportWidth: 390, documentWidth: 390 }, pageErrors = [], consoleErrors = [], launchError = null } = {}) {
  const visits = [];
  const browserTypes = {};
  for (const name of ['chromium', 'firefox', 'webkit']) {
    browserTypes[name] = {
      launch: async () => {
        if (launchError === name) throw new Error(name + ' browser is not installed');
        return {
          newPage: async () => {
            const handlers = {};
            return {
              on: (event, handler) => { (handlers[event] ??= []).push(handler); },
              goto: async url => {
                const response = await fetch(url);
                const body = await response.text();
                visits.push({ name, url, body });
                for (const error of pageErrors) for (const handler of handlers.pageerror ?? []) handler(new Error(error));
                for (const error of consoleErrors) for (const handler of handlers.console ?? []) handler({ type: () => 'error', text: () => error });
                return { status: () => status ?? response.status };
              },
              evaluate: async () => layout,
              close: async () => {},
            };
          },
          close: async () => {},
        };
      },
    };
  }
  return { browserTypes, visits };
}

function runtimeFixture(files = [
  { path: 'frontend/dist/index.html', type: 'file' },
  { path: 'frontend/dist/assets/app.js', type: 'file' },
]) {
  const reads = [];
  return {
    reads,
    runtime: {
      listFiles: async () => files,
      readBuffer: async ({ path }) => {
        reads.push(path);
        if (path.endsWith('index.html')) return Buffer.from('<!doctype html><title>Generated app</title>');
        if (path.endsWith('app.js')) return Buffer.from('globalThis.appReady=true;');
        throw new Error('unexpected file');
      },
    },
  };
}

test('browser verifier serves built static output and checks Chromium, Firefox and WebKit', async () => {
  const { runtime, reads } = runtimeFixture();
  const harness = browserHarness();
  const service = new WebBrowserVerificationService({ runtime, browserTypes: harness.browserTypes });
  const result = await service.verify({ workspaceId: 'web-workspace', projectPath: 'frontend', outputDirectory: 'dist' });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.summary, { total: 3, passed: 3, failed: 0 });
  assert.deepEqual(result.browsers.map(item => item.name), ['chromium', 'firefox', 'webkit']);
  assert.ok(harness.visits.every(item => item.url.startsWith('http://127.0.0.1:')));
  assert.ok(reads.includes('frontend/dist/index.html'));
  assert.ok(harness.visits.every(item => item.body.includes('Generated app')));
});

test('browser verifier reports page errors, console errors and horizontal overflow', async () => {
  const { runtime } = runtimeFixture();
  const harness = browserHarness({
    layout: { title: 'Broken app', viewportWidth: 390, documentWidth: 480 },
    pageErrors: ['uncaught app exception'],
    consoleErrors: ['missing chunk.js'],
  });
  const service = new WebBrowserVerificationService({ runtime, browserTypes: harness.browserTypes });
  const result = await service.verify({ workspaceId: 'web-workspace', projectPath: 'frontend', browsers: ['chromium'] });
  assert.equal(result.status, 'failed');
  assert.equal(result.summary.failed, 1);
  assert.equal(result.browsers[0].horizontalOverflow, true);
  assert.deepEqual(result.browsers[0].pageErrors, ['uncaught app exception']);
  assert.deepEqual(result.browsers[0].consoleErrors, ['missing chunk.js']);
});

test('browser verifier preserves partial browser failures and rejects missing entry documents', async () => {
  const { runtime } = runtimeFixture();
  const harness = browserHarness({ launchError: 'firefox' });
  const service = new WebBrowserVerificationService({ runtime, browserTypes: harness.browserTypes });
  const partial = await service.verify({ workspaceId: 'web-workspace', projectPath: 'frontend', browsers: ['chromium', 'firefox'] });
  assert.equal(partial.status, 'failed');
  assert.equal(partial.summary.passed, 1);
  assert.equal(partial.summary.failed, 1);
  assert.match(partial.browsers[1].error, /not installed/);

  const emptyRuntime = { listFiles: async () => [], readBuffer: async () => Buffer.alloc(0) };
  const emptyService = new WebBrowserVerificationService({ runtime: emptyRuntime, browserTypes: harness.browserTypes });
  await assert.rejects(() => emptyService.verify({ workspaceId: 'web-workspace' }), /index\.html/i);
});

test('browser verifier validates browser names, viewport and project paths before launching', async () => {
  const { runtime } = runtimeFixture();
  const harness = browserHarness();
  const service = new WebBrowserVerificationService({ runtime, browserTypes: harness.browserTypes });
  await assert.rejects(() => service.verify({ workspaceId: 'web-workspace', browsers: ['safari'] }), /browser/i);
  await assert.rejects(() => service.verify({ workspaceId: 'web-workspace', projectPath: '../outside' }), /relative/i);
  await assert.rejects(() => service.verify({ workspaceId: 'web-workspace', viewportWidth: 0 }), /viewport/i);
  assert.equal(harness.visits.length, 0);
});
