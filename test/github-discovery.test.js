import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubDiscoveryClient, GitHubDiscoveryError } from '../src/adapters/github-discovery.js';

function fakeApi(handler) {
  const requests = [];
  return {
    requests, budget: { used: 0, halted: false },
    request: async (route, parameters, options) => {
      requests.push({ route, parameters, options });
      return handler ? handler(route, parameters, options, requests) : {
        data: { total_count: 1, items: [{ id: 7, full_name: 'org/tool', name: 'tool', html_url: 'https://github.com/org/tool', archived: false, license: { spdx_id: 'MIT', name: 'MIT License' } }] },
        headers: {},
      };
    },
  };
}

test('GitHub discovery uses the shared API client and normalizes license metadata', async () => {
  const apiClient = fakeApi();
  const result = await new GitHubDiscoveryClient({ apiClient }).searchRepositories('agent framework', { maxResults: 10 });
  assert.equal(result.results[0].fullName, 'org/tool');
  assert.equal(result.results[0].license.spdxId, 'MIT');
  assert.equal(result.results[0].discoveryOnly, true);
  assert.equal(apiClient.requests[0].route, 'GET /search/repositories');
  assert.equal(apiClient.requests[0].options.resource, 'search');
});

test('GitHub discovery halts on rate-limit responses without retrying or bypassing', async () => {
  const apiClient = fakeApi(async () => { throw Object.assign(new Error('rate limit'), { status: 403 }); });
  await assert.rejects(() => new GitHubDiscoveryClient({ apiClient }).searchRepositories('web framework'),
    error => error instanceof GitHubDiscoveryError && error.safeHalt === true && error.status === 403);
  assert.equal(apiClient.requests.length, 1);
});

test('GitHub discovery validates query and bounded result limits', async () => {
  const client = new GitHubDiscoveryClient({ apiClient: fakeApi(async () => ({ data: { total_count: 0, items: [] }, headers: {} })) });
  await assert.rejects(() => client.searchRepositories(''), /query/);
  await assert.rejects(() => client.searchRepositories('web', { maxResults: 501 }), /maxResults/);
});

test('GitHub discovery enumerates public repositories in a vendor organization', async () => {
  const apiClient = fakeApi(async route => ({ data: route === 'GET /orgs/{org}/repos'
    ? [{ id: 11, full_name: 'google/project', name: 'project', html_url: 'https://github.com/google/project', archived: false, license: { spdx_id: 'Apache-2.0', name: 'Apache License 2.0' } }]
    : [], headers: {} }));
  const result = await new GitHubDiscoveryClient({ apiClient }).listOrganizationRepositories('google');
  assert.equal(result.results[0].fullName, 'google/project');
  assert.equal(apiClient.requests[0].route, 'GET /orgs/{org}/repos');
  assert.equal(apiClient.requests[0].parameters.type, 'public');
});

test('GitHub discovery exposes continuation pages when bounded search is truncated', async () => {
  const pages = [];
  const apiClient = fakeApi(async (route, parameters) => {
    pages.push(parameters.page);
    return { data: { total_count: 5, items: [
      { id: parameters.page * 10 + 1, full_name: `org/tool-${parameters.page}-a` },
      { id: parameters.page * 10 + 2, full_name: `org/tool-${parameters.page}-b` },
    ] }, headers: {} };
  });
  const client = new GitHubDiscoveryClient({ apiClient, perPage: 2, maxPages: 1 });
  const first = await client.searchRepositories('agent', { maxResults: 5 });
  const second = await client.searchRepositories('agent', { maxResults: 5, page: first.nextPage });
  assert.equal(first.truncated, true);
  assert.equal(first.nextPage, 2);
  assert.equal(second.nextPage, 3);
  assert.deepEqual(pages, [1, 2]);
});

test('forks are excluded unless GitHub compare confirms unique commits ahead of upstream', async () => {
  const apiClient = fakeApi(async route => {
    if (route === 'GET /search/repositories') return { data: { total_count: 2, items: [
      { id: 1, full_name: 'fork/unverified', fork: true },
      {
        id: 2, full_name: 'fork/verified', fork: true, default_branch: 'main',
        owner: { login: 'fork' },
        parent: { full_name: 'upstream/tool', default_branch: 'main' },
      },
    ] }, headers: {} };
    if (route === 'GET /repos/{owner}/{repo}/compare/{base}...{head}') {
      assert.equal(route, 'GET /repos/{owner}/{repo}/compare/{base}...{head}');
      return { data: { ahead_by: 3, total_commits: 3 }, headers: {} };
    }
    throw new Error(`Unexpected route: ${route}`);
  });
  const result = await new GitHubDiscoveryClient({ apiClient }).searchRepositories('ocr');
  assert.deepEqual(result.results.map(item => item.fullName), ['fork/verified']);
  const compare = apiClient.requests.find(item => item.route.includes('/compare/'));
  assert.equal(compare.parameters.owner, 'upstream');
  assert.equal(compare.parameters.repo, 'tool');
  assert.equal(compare.parameters.head, 'fork:main');
});
