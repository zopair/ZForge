import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('task event ledger appends bounded structured events with monotonic cursors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-events-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'progress-test-token-123' });
  await gateway.ready;
  try {
    const task = await gateway.store.create({ request: 'observe agent progress' });
    const first = await gateway.store.appendEvent(task.id, 'agent.step.started', { step: 1 });
    const second = await gateway.store.appendEvent(task.id, 'agent.tool.started', { toolName: 'run_command' });
    assert.equal(first.sequence, 2);
    assert.equal(second.sequence, 3);
    assert.deepEqual(gateway.store.eventsSince(task.id, 1).events.map(event => event.type), ['agent.step.started', 'agent.tool.started']);
    await assert.rejects(() => gateway.store.appendEvent(task.id, 'INVALID EVENT', {}), /event type/i);
    await assert.rejects(() => gateway.store.appendEvent(task.id, 'agent.invalid', { payload: 'x'.repeat(9000) }), /event details/i);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('authenticated task events endpoint supports cursor polling without exposing another task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-events-api-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'progress-test-token-123' });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer progress-test-token-123', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'watch the agent' }) });
    const task = await created.json();
    await gateway.store.appendEvent(task.id, 'agent.step.started', { step: 2 });
    const denied = await fetch(base + '/api/tasks/' + task.id + '/events');
    assert.equal(denied.status, 401);
    const response = await fetch(base + '/api/tasks/' + task.id + '/events?after=1', { headers });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.taskId, task.id);
    assert.equal(payload.events.length, 1);
    assert.equal(payload.events[0].sequence, 2);
    assert.equal(payload.cursor, 2);
    const missing = await fetch(base + '/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events', { headers });
    assert.equal(missing.status, 404);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('agent-run streams persisted progress events while execution is active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-agent-events-api-'));
  const agentService = {
    runTask: async ({ onProgress }) => {
      await onProgress({ type: 'agent.step.started', details: { step: 1 } });
      await onProgress({ type: 'agent.tool.started', details: { step: 1, toolName: 'read_file' } });
      return { completed: true, status: 'completed', summary: 'done', steps: 1, evidence: [] };
    },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'progress-test-token-123', agentService });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer progress-test-token-123', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'stream agent work' }) });
    const task = await created.json();
    const run = await fetch(base + '/api/tasks/' + task.id + '/agent-run', { method: 'POST', headers, body: JSON.stringify({ confirmExecution: true }) });
    assert.equal(run.status, 200);
    const events = await fetch(base + '/api/tasks/' + task.id + '/events?after=1', { headers });
    const payload = await events.json();
    assert.ok(payload.events.some(event => event.type === 'agent.step.started'));
    assert.ok(payload.events.some(event => event.type === 'agent.tool.started'));
    assert.equal(payload.status, 'succeeded');
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
