import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubApiClient } from '../src/adapters/github-api-client.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

test('real Octokit transport performs counted preflight and data request through mocked fetch', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const payload = String(url).endsWith('/rate_limit')
      ? { resources: { core: { remaining: 4000, limit: 5000 }, search: { remaining: 25, limit: 30 } } }
      : { id: 7, full_name: 'org/tool' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '3999', 'x-ratelimit-limit': '5000', 'x-ratelimit-resource': 'core' },
    });
  };
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  const client = new GitHubApiClient({ token: 'test-token', budget, fetchImpl });
  const response = await client.request('GET /repos/{owner}/{repo}', { owner: 'org', repo: 'tool' });
  assert.equal(response.data.full_name, 'org/tool');
  assert.equal(calls.length, 2);
  assert.equal(client.snapshot().used, 2);
});

test('Octokit throttling aborts on rate-limit response without hidden retries', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/rate_limit')) {
      return new Response(JSON.stringify({ resources: { core: { remaining: 4000, limit: 5000 } } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' },
    });
  };
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  const client = new GitHubApiClient({ token: 'test-token', budget, fetchImpl });
  await assert.rejects(() => client.request('GET /repos/{owner}/{repo}', { owner: 'org', repo: 'tool' }));
  assert.equal(calls.length, 2);
  assert.equal(client.snapshot().halted, true);
  assert.equal(client.snapshot().used, 2);
});
