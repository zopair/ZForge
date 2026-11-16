import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubApiClient } from '../src/adapters/github-api-client.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

function fakeOctokit({ remaining = 4000, limit = 5000 } = {}) {
  const calls = [];
  return {
    calls,
    rest: { rateLimit: { get: async () => {
      calls.push('/rate_limit');
      return { data: { resources: { core: { remaining, limit }, search: { remaining: 25, limit: 30 } } } };
    } } },
    request: async (route, parameters) => {
      calls.push({ route, parameters });
      return { data: { ok: true }, headers: { 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-limit': String(limit), 'x-ratelimit-resource': 'core' } };
    },
  };
}

test('one Octokit client and budget share the exact request cap across adapter calls', async () => {
  const budget = new GlobalApiBudget({ maxRequests: 3 });
  const octokit = fakeOctokit();
  const client = new GitHubApiClient({ budget, octokit });
  await client.request('GET /repos/{owner}/{repo}', { owner: 'org', repo: 'one' });
  await client.request('GET /repos/{owner}/{repo}', { owner: 'org', repo: 'two' });
  assert.equal(client.snapshot().used, 3);
  await assert.rejects(() => client.request('GET /repos/{owner}/{repo}', { owner: 'org', repo: 'three' }), /budget|halted/i);
  assert.equal(octokit.calls.filter(call => typeof call === 'object').length, 2);
});

test('critical quota blocks the first data request after one counted preflight', async () => {
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  const octokit = fakeOctokit({ remaining: 4, limit: 100 });
  const client = new GitHubApiClient({ budget, octokit });
  await assert.rejects(() => client.request('GET /search/repositories', { q: 'ocr' }, { resource: 'search' }), /critical|quota/i);
  assert.equal(client.snapshot().used, 1);
  assert.equal(octokit.calls.length, 1);
});

test('API boundary rejects non-GET operations', async () => {
  const client = new GitHubApiClient({ octokit: fakeOctokit() });
  await assert.rejects(() => client.request('POST /repos/{owner}/{repo}/issues', {}), /GET requests only/);
});
