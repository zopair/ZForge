import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPagesDeployment } from '../src/core/pages-deployment-verifier.js';

function fixture({ metaSha = 'abc123', cache = 'zforge-black-vanta-abc123' } = {}) {
  const files = new Map([
    ['index.html', '<title>ZForge | BLACK VANTA</title><script src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">'],
    ['deployment-meta.json', JSON.stringify({ commit: metaSha })],
    ['sw.js', 'const CACHE="' + cache + '";'],
    ['assets/app.js', 'window.blackVantaReady = true;'],
    ['assets/app.css', 'body { background: #000; }'],
  ]);
  return async url => {
    const path = new URL(url).pathname.split('/').slice(-2).join('/');
    const content = files.get(path) ?? files.get(path.replace(/^.*?(assets\/)/, '$1')) ?? files.get(path.split('/').pop());
    return new Response(content ?? 'not found', { status: content === undefined ? 404 : 200 });
  };
}

test('verifies deployed commit, BLACK VANTA shell, assets and service-worker cache revision', async () => {
  const result = await verifyPagesDeployment({
    baseUrl: 'https://example.github.io/ZForge/',
    expectedCommit: 'abc123',
    fetchImpl: fixture(),
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.commit, 'abc123');
  assert.equal(result.assetsChecked, 2);
});

test('rejects a live Pages deployment that serves a stale commit', async () => {
  await assert.rejects(() => verifyPagesDeployment({
    baseUrl: 'https://example.github.io/ZForge/',
    expectedCommit: 'abcdef123456',
    fetchImpl: fixture({ metaSha: 'oldsha123456', cache: 'zforge-black-vanta-oldsha123456' }),
  }), /commit mismatch/i);
});

test('rejects missing critical assets and stale service-worker revisions', async () => {
  await assert.rejects(() => verifyPagesDeployment({
    baseUrl: 'https://example.github.io/ZForge/',
    expectedCommit: 'abc123',
    fetchImpl: async url => url.endsWith('/assets/app.js') ? new Response('missing', { status: 404 }) : fixture()(url),
  }), /app\.js.*404/i);
});
