import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';
import { ContainerExecutionRuntime } from '../src/runtime/container-execution-runtime.js';

test('local runtime exposes a real workspace path and exact binary file bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-buffer-'));
  try {
    const runtime = await new LocalExecutionRuntime({ rootDir: root }).initialize();
    await runtime.createWorkspace({ id: 'ws-bin' });
    const written = await runtime.writeFile({ workspaceId: 'ws-bin', path: 'release/app.bin', content: 'binary-placeholder' });
    const path = await runtime.getWorkspacePath({ workspaceId: 'ws-bin' });
    const buffer = await runtime.readBuffer({ workspaceId: 'ws-bin', path: 'release/app.bin' });
    assert.equal(path, join(root, 'ws-bin'));
    assert.equal(buffer.toString('utf8'), 'binary-placeholder');
    assert.ok(written.bytes > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('container runtime invokes podman with bounded resources and workspace-only mount', async () => {
  let invocation;
  const hostRuntime = {
    getWorkspacePath: async () => '/tmp/zforge-workspaces/ws-1',
    execute: async input => { invocation = input; return { exitCode: 0, stdout: 'container-ok', stderr: '' }; },
  };
  const runtime = new ContainerExecutionRuntime({ hostRuntime, engine: 'podman', image: 'node:24-bookworm-slim', network: 'bridge', cpuLimit: 2, memoryLimit: '4g', pidsLimit: 128 });
  const result = await runtime.execute({ workspaceId: 'ws-1', command: 'node', args: ['--version'], cwd: '.', timeoutMs: 30000 });
  assert.equal(result.stdout, 'container-ok');
  assert.equal(invocation.command, 'podman');
  assert.ok(invocation.args.includes('--read-only'));
  assert.ok(invocation.args.includes('--cap-drop=ALL'));
  assert.ok(invocation.args.includes('--network=bridge'));
  assert.ok(invocation.args.includes('/tmp/zforge-workspaces/ws-1:/workspace:rw'));
  assert.deepEqual(invocation.args.slice(-2), ['node', '--version']);
});

test('container runtime rejects unsupported engines and workspace cwd traversal', async () => {
  const hostRuntime = { getWorkspacePath: async () => '/tmp/ws', execute: async () => ({ exitCode: 0 }) };
  assert.throws(() => new ContainerExecutionRuntime({ hostRuntime, engine: 'bash' }), /podman or docker/i);
  const runtime = new ContainerExecutionRuntime({ hostRuntime });
  await assert.rejects(() => runtime.execute({ workspaceId: 'ws-1', command: 'node', cwd: '../outside' }), /relative path/i);
});
