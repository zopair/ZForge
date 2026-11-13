import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('gateway exposes confirmed multi-agent orchestration and persists its aggregate result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-orchestration-api-'));
  let planReceived;
  const coordinator = {
    executePlan: async input => {
      planReceived = input;
      return { status: 'completed', workspaceId: input.workspaceId, summary: { total: 2, succeeded: 2, failed: 0, skipped: 0 }, tasks: [
        { id: 'research', status: 'succeeded', summary: 'Research complete' },
        { id: 'build', status: 'succeeded', summary: 'Build complete' },
      ] };
    },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'orchestration-test-token', multiAgentCoordinator: coordinator });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer orchestration-test-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'Build a verified web service', workspaceId: 'project-alpha' }) });
    assert.equal(created.status, 201);
    const task = await created.json();
    const denied = await fetch(base + '/api/tasks/' + task.id + '/orchestrate', { method: 'POST', headers, body: JSON.stringify({ tasks: [] }) });
    assert.equal(denied.status, 409);
    const response = await fetch(base + '/api/tasks/' + task.id + '/orchestrate', {
      method: 'POST', headers,
      body: JSON.stringify({ confirmExecution: true, tasks: [{ id: 'research', agentId: 'researcher', request: 'Research options' }, { id: 'build', agentId: 'builder', request: 'Build service', dependsOn: ['research'] }] }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.summary.succeeded, 2);
    assert.equal(planReceived.workspaceId, 'project-alpha');
    const fetched = await fetch(base + '/api/tasks/' + task.id, { headers });
    assert.equal((await fetched.json()).result.tasks.length, 2);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
