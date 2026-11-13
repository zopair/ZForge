import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';

async function withGateway(run) {
  const root = await mkdtemp(join(tmpdir(), 'zforge-gateway-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'test-secret' });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const address = gateway.server.address();
  try { await run(`http://127.0.0.1:${address.port}`, gateway, root); }
  finally { await new Promise(resolve => gateway.server.close(resolve)); await rm(root, { recursive: true, force: true }); }
}

test('health endpoint reports runtime readiness without exposing secrets', async () => {
  await withGateway(async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal('token' in payload, false);
  });
});

test('task gateway requires bearer authentication for task operations', async () => {
  await withGateway(async (base) => {
    const response = await fetch(`${base}/api/tasks`);
    assert.equal(response.status, 401);
  });
});

test('task gateway creates and retrieves durable task records', async () => {
  await withGateway(async (base, gateway, root) => {
    const created = await fetch(`${base}/api/tasks`, {
      method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Inspect this workspace', workspaceId: 'ws-a' }),
    });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.status, 'queued');
    assert.equal(task.request, 'Inspect this workspace');
    const fetched = await fetch(`${base}/api/tasks/${task.id}`, { headers: { Authorization: 'Bearer test-secret' } });
    assert.equal(fetched.status, 200);
    assert.equal((await fetched.json()).id, task.id);
    const persisted = JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8'));
    assert.equal(persisted.length, 1);
  });
});

test('task gateway validates task input and rejects malformed JSON', async () => {
  await withGateway(async (base) => {
    const headers = { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' };
    const empty = await fetch(`${base}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ request: ' ' }) });
    assert.equal(empty.status, 400);
    const malformed = await fetch(`${base}/api/tasks`, { method: 'POST', headers, body: '{' });
    assert.equal(malformed.status, 400);
  });
});

test('execution runtime creates isolated workspace directories and runs argument arrays', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-exec-'));
  try {
    const runtime = new LocalExecutionRuntime({ rootDir: root });
    const workspace = await runtime.createWorkspace({ id: 'ws-test' });
    const result = await runtime.execute({ workspaceId: 'ws-test', command: process.execPath, args: ['-e', 'process.stdout.write("runtime-ok")'] });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'runtime-ok');
    assert.equal(workspace.id, 'ws-test');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('execution runtime rejects workspace path traversal and enforces timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-exec-'));
  try {
    const runtime = new LocalExecutionRuntime({ rootDir: root, defaultTimeoutMs: 100 });
    await assert.rejects(() => runtime.createWorkspace({ id: '../outside' }), /invalid workspace id/i);
    await runtime.createWorkspace({ id: 'ws-timeout' });
    await assert.rejects(() => runtime.execute({ workspaceId: 'ws-timeout', command: process.execPath, args: ['-e', 'setTimeout(()=>{},10000)'], timeoutMs: 100 }), /timed out/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
