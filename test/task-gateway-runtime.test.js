import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';

async function withGateway(run) {
  const root = await mkdtemp(join(tmpdir(), 'zforge-gateway-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'test-secret-token' });
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
      method: 'POST', headers: { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Inspect this workspace', workspaceId: 'ws-a' }),
    });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.status, 'queued');
    assert.equal(task.request, 'Inspect this workspace');
    const fetched = await fetch(`${base}/api/tasks/${task.id}`, { headers: { Authorization: 'Bearer test-secret-token' } });
    assert.equal(fetched.status, 200);
    assert.equal((await fetched.json()).id, task.id);
    const persisted = JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8'));
    assert.equal(persisted.length, 1);
  });
});

test('task gateway validates task input and rejects malformed JSON', async () => {
  await withGateway(async (base) => {
    const headers = { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' };
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

test('authenticated gateway provisions a workspace and executes a task through the runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-full-runtime-'));
  const { LocalExecutionRuntime } = await import('../src/runtime/local-execution-runtime.js');
  const runtime = await new LocalExecutionRuntime({ rootDir: join(root, 'workspaces') }).initialize();
  const gateway = createTaskGateway({ dataDir: join(root, 'data'), token: 'test-secret-token', runtime });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const headers = { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' };
  try {
    const workspaceResponse = await fetch(`${base}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify({ id: 'ws-api' }) });
    assert.equal(workspaceResponse.status, 201);
    const created = await fetch(`${base}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ request: 'Run a local test command', workspaceId: 'ws-api' }) });
    const task = await created.json();
    const execution = await fetch(`${base}/api/tasks/${task.id}/execute`, { method: 'POST', headers, body: JSON.stringify({ command: process.execPath, args: ['-e', 'process.stdout.write("gateway-executed")'] }) });
    assert.equal(execution.status, 200);
    const result = await execution.json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.stdout, 'gateway-executed');
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('execution runtime refuses a workspace cwd symlink that resolves outside its root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-symlink-'));
  const outside = await mkdtemp(join(tmpdir(), 'zforge-outside-'));
  try {
    const runtime = await new LocalExecutionRuntime({ rootDir: root }).initialize();
    await runtime.createWorkspace({ id: 'ws-link' });
    const { symlink } = await import('node:fs/promises');
    await symlink(outside, join(root, 'ws-link', 'escape'), 'dir');
    await assert.rejects(
      () => runtime.execute({ workspaceId: 'ws-link', cwd: 'escape', command: process.execPath, args: ['-e', 'process.exit(0)'] }),
      /resolves outside workspace/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('agent execution route requires explicit confirmation and persists verified completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-agent-gateway-'));
  const agentService = {
    runTask: async ({ request, model, workspaceId }) => ({
      status: 'completed', completed: true, summary: `Executed: ${request}`, model, workspaceId, evidence: [{ id: 'verified-1', ok: true }],
    }),
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'test-secret-token', agentService });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const headers = { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(`${base}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ request: 'Create a verified artifact', workspaceId: 'ws-agent-api' }) });
    const task = await created.json();
    const denied = await fetch(`${base}/api/tasks/${task.id}/agent-run`, { method: 'POST', headers, body: JSON.stringify({ model: 'qwen3:8b' }) });
    assert.equal(denied.status, 409);
    const executed = await fetch(`${base}/api/tasks/${task.id}/agent-run`, { method: 'POST', headers, body: JSON.stringify({ model: 'qwen3:8b', confirmExecution: true }) });
    assert.equal(executed.status, 200);
    const result = await executed.json();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.completed, true);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('task gateway allows explicit PWA origins and handles preflight requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-cors-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'test-secret-token', allowedOrigins: ['https://zopair.github.io'] });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  try {
    const allowed = await fetch(`${base}/api/tasks`, { method: 'OPTIONS', headers: { Origin: 'https://zopair.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://zopair.github.io');
    const denied = await fetch(`${base}/api/tasks`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
