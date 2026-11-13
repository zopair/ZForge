import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';

test('workspace file APIs write, read and enumerate regular files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-files-'));
  try {
    const runtime = await new LocalExecutionRuntime({ rootDir: root }).initialize();
    await runtime.createWorkspace({ id: 'ws-files' });
    await runtime.writeFile({ workspaceId: 'ws-files', path: 'src/main.js', content: 'export const answer = 42;' });
    const file = await runtime.readFile({ workspaceId: 'ws-files', path: 'src/main.js' });
    assert.equal(file.content, 'export const answer = 42;');
    const files = await runtime.listFiles({ workspaceId: 'ws-files' });
    assert.ok(files.some(item => item.path === 'src/main.js' && item.type === 'file'));
    assert.ok(files.some(item => item.path === 'src' && item.type === 'directory'));
    assert.equal(files.some(item => item.path === '.tmp'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('workspace file APIs reject traversal, absolute paths and symbolic links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-file-guard-'));
  const outside = await mkdtemp(join(tmpdir(), 'zforge-file-outside-'));
  try {
    const runtime = await new LocalExecutionRuntime({ rootDir: root }).initialize();
    await runtime.createWorkspace({ id: 'ws-guard' });
    await assert.rejects(() => runtime.writeFile({ workspaceId: 'ws-guard', path: '../escape.txt', content: 'no' }), /escapes workspace/i);
    await assert.rejects(() => runtime.readFile({ workspaceId: 'ws-guard', path: join(outside, 'secret.txt') }), /relative path/i);
    await symlink(outside, join(root, 'ws-guard', 'external'), 'dir');
    await assert.rejects(() => runtime.writeFile({ workspaceId: 'ws-guard', path: 'external/escape.txt', content: 'no' }), /symbolic links/i);
    await assert.rejects(() => runtime.listFiles({ workspaceId: 'ws-guard' }), /symbolic link/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
