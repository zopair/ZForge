import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubRepositoryInspector } from '../src/adapters/github-repository-inspector.js';

function encode(value) { return Buffer.from(value).toString('base64'); }
function fakeApi(files, metadata = {}) {
  const calls = [];
  return {
    calls,
    request: async (route, parameters) => {
      calls.push({ route, parameters });
      if (route === 'GET /repos/{owner}/{repo}') return { data: {
        id: 9, full_name: 'org/tool', html_url: 'https://github.com/org/tool', archived: false,
        default_branch: 'main', license: { spdx_id: 'MIT', name: 'MIT License' }, ...metadata,
      }, headers: {} };
      if (route === 'GET /repos/{owner}/{repo}/contents') return { data: Object.keys(files).map(name => ({
        name, type: name === 'tests' ? 'dir' : 'file', size: files[name]?.size ?? 1,
      })), headers: {} };
      if (route === 'GET /repos/{owner}/{repo}/contents/{path}') {
        const file = files[parameters.path];
        return file ? { data: { path: parameters.path, encoding: 'base64', content: file.content, size: file.size ?? 1 }, headers: {} } : null;
      }
      throw new Error(`Unexpected route: ${route}`);
    },
  };
}

test('repository inspector shares the Octokit API boundary and reads source evidence without executing code', async () => {
  const apiClient = fakeApi({
    LICENSE: { content: encode('MIT License') },
    'package.json': { content: encode(JSON.stringify({ dependencies: { react: '18.2.0' } })) },
    'README.md': { content: encode('# Tool') },
  });
  const result = await new GitHubRepositoryInspector({ apiClient }).inspectRepository('org/tool');
  assert.equal(result.repository.license.spdxId, 'MIT');
  assert.equal(result.licenseFiles[0].content, 'MIT License');
  assert.equal(result.dependencyManifests.length, 1);
  assert.equal(result.inspectionStatus, 'NEEDS_DEPENDENCY_AND_LICENSE_REVIEW');
  assert.ok(apiClient.calls.length >= 4);
});

test('repository inspector rejects malformed repository names', async () => {
  const inspector = new GitHubRepositoryInspector({ apiClient: fakeApi({}) });
  await assert.rejects(() => inspector.inspectRepository('not-a-full-name'), /owner\/repository/);
});

test('repository inspector rejects paid credentials found in .env.example', async () => {
  const apiClient = fakeApi({
    'README.md': { content: encode('# Tool') },
    '.env.example': { content: encode('OPENAI_API_KEY=replace-me') },
    'package.json': { content: encode(JSON.stringify({ dependencies: { react: '18.2.0' } })) },
  });
  const result = await new GitHubRepositoryInspector({ apiClient }).inspectRepository('org/tool');
  assert.equal(result.zeroCostAssessment.status, 'REJECTED_PAID_REQUIREMENT');
  assert.equal(result.inspectionStatus, 'REJECTED_PAID_REQUIREMENT');
});
