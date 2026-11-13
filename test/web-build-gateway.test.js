import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('gateway requires explicit confirmation and persists web build artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-web-api-'));
  let buildInput;
  const webBuildService = {
    build: async input => {
      buildInput = input;
      return { status: 'succeeded', workspaceId: input.workspaceId, artifacts: [{ id: 'web-1', kind: 'web', filename: 'index.html', sha256: 'hash' }] };
    },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'web-build-test-token', webBuildService });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer web-build-test-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'Build web app', workspaceId: 'web-workspace' }) });
    const task = await created.json();
    const denied = await fetch(base + '/api/tasks/' + task.id + '/web-build', { method: 'POST', headers, body: JSON.stringify({ projectPath: 'frontend' }) });
    assert.equal(denied.status, 409);
    const response = await fetch(base + '/api/tasks/' + task.id + '/web-build', {
      method: 'POST', headers,
      body: JSON.stringify({ confirmExecution: true, projectPath: 'frontend', outputDirectory: 'out', runTests: false }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.artifacts[0].id, 'web-1');
    assert.equal(buildInput.workspaceId, 'web-workspace');
    assert.equal(buildInput.outputDirectory, 'out');
    assert.equal(buildInput.runTests, false);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
