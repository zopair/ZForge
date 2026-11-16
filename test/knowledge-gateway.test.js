import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeGateway } from '../src/adapters/knowledge-gateway.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

test('search normalizes at most five SearXNG JSON results into Markdown', async () => {
  const gateway = new KnowledgeGateway({
    instances: ['https://search.example.test/'],
    requestImpl: async (_url, { budget, agentId }) => {
      budget.consume({ method: 'GET', url: '/search', agentId });
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ results: Array.from({ length: 8 }, (_, i) => ({ title: `Result ${i + 1}`, url: `https://example.test/${i}`, content: 'Evidence snippet' })) }),
      };
    },
  });
  const budget = new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } });
  const result = await gateway.search({ query: 'open source OCR', agentId: 'blacksmith', budget });
  assert.equal(result.results.length, 5);
  assert.match(result.markdown, /UNVERIFIED/);
  assert.equal(budget.snapshot().used, 1);
  assert.equal(budget.snapshot().agentUsage.blacksmith, 1);
});

test('fetch removes executable and non-content HTML before Markdown conversion', async () => {
  const gateway = new KnowledgeGateway({
    requestImpl: async (_url, { budget, agentId }) => {
      budget.consume({ method: 'GET', url: '/page', agentId });
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<html><body><main><h1>Useful</h1><script>steal()</script><p>Readable content</p><a href="javascript:alert(1)">unsafe</a><iframe src="https://evil.example"></iframe></main></body></html>',
        url: 'https://example.test/page',
      };
    },
  });
  const budget = new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } });
  const result = await gateway.fetch({ url: 'https://example.test/page', agentId: 'blacksmith', budget });
  assert.match(result.markdown, /Readable content/);
  assert.doesNotMatch(result.markdown, /steal|iframe|javascript:/);
  assert.equal(result.status, 'UNTRUSTED_SOURCE_CONTENT');
  assert.equal(budget.snapshot().used, 1);
});

test('fetch rejects private and local network destinations before requesting them', async () => {
  const gateway = new KnowledgeGateway({ requestImpl: async () => { throw new Error('transport must not be called'); } });
  const budget = new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } });
  await assert.rejects(gateway.fetch({ url: 'http://127.0.0.1/admin', agentId: 'blacksmith', budget }), /private or reserved IP/);
  assert.equal(budget.snapshot().used, 0);
});

test('search fails closed when no public SearXNG JSON endpoint is configured', async () => {
  const gateway = new KnowledgeGateway();
  const budget = new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } });
  await assert.rejects(gateway.search({ query: 'open source OCR', agentId: 'blacksmith', budget }), /No public SearXNG JSON instances/);
  assert.equal(budget.snapshot().used, 0);
});
