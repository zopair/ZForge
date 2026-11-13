import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('gateway requires explicit confirmation and persists Android build artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-android-api-'));
  let buildInput;
  const androidBuildService = {
    build: async input => {
      buildInput = input;
      return { status: 'succeeded', workspaceId: input.workspaceId, artifacts: [{ id: 'apk-1', kind: 'apk', filename: 'app-debug.apk', sha256: 'hash' }] };
    },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'android-build-test-token', androidBuildService });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer android-build-test-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'Build Android app', workspaceId: 'android-workspace' }) });
    const task = await created.json();
    const denied = await fetch(base + '/api/tasks/' + task.id + '/android-build', { method: 'POST', headers, body: JSON.stringify({ formats: ['apk'] }) });
    assert.equal(denied.status, 409);
    const response = await fetch(base + '/api/tasks/' + task.id + '/android-build', {
      method: 'POST', headers,
      body: JSON.stringify({ confirmExecution: true, projectPath: 'mobile', formats: ['apk', 'aab'], runTests: true }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.artifacts[0].id, 'apk-1');
    assert.equal(buildInput.workspaceId, 'android-workspace');
    assert.deepEqual(buildInput.formats, ['apk', 'aab']);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
