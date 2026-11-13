import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTaskHistoryMemoryStore, CompositeMemoryStore } from '../src/adapters/local-task-history-memory-store.js';

test('task history memory returns recent verified outcomes and preserves failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-history-'));
  try {
    await writeFile(join(root, 'tasks.json'), JSON.stringify([
      { id: 'old', status: 'succeeded', request: 'older task', updatedAt: '2026-01-01T00:00:00.000Z', result: { summary: 'old complete', trace: [] } },
      { id: 'failed', status: 'failed', request: 'compile native module', updatedAt: '2026-01-02T00:00:00.000Z', error: 'missing compiler', result: { trace: [{ name: 'run_command', ok: false }] } },
      { id: 'inconclusive', status: 'inconclusive', request: 'test alternate tool', updatedAt: '2026-01-03T00:00:00.000Z', result: { message: 'tool did not return evidence' } },
      { id: 'queued', status: 'queued', request: 'pending', updatedAt: '2026-01-04T00:00:00.000Z' }
    ]));
    const store = new LocalTaskHistoryMemoryStore({ dataDir: root, maxTasks: 2 });
    const memory = await store.loadRelevant({ request: 'build module' });
    assert.equal(memory.taskHistory.length, 2);
    assert.equal(memory.taskHistory[0].status, 'inconclusive');
    assert.equal(memory.taskHistory[1].error, 'missing compiler');
    assert.equal(memory.taskHistory.some(item => item.status === 'queued'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('task history memory reports an empty history before the first task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-history-empty-'));
  try {
    const store = new LocalTaskHistoryMemoryStore({ dataDir: root });
    assert.deepEqual((await store.loadRelevant()).taskHistory, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('task history memory refuses a symlinked ledger', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-history-link-'));
  const outside = await mkdtemp(join(tmpdir(), 'zforge-history-outside-'));
  try {
    await writeFile(join(outside, 'tasks.json'), '[]');
    await symlink(join(outside, 'tasks.json'), join(root, 'tasks.json'));
    const store = new LocalTaskHistoryMemoryStore({ dataDir: root });
    await assert.rejects(() => store.loadRelevant(), /symbolic link/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('composite memory keeps repository lessons and task history as separate sources', async () => {
  const composite = new CompositeMemoryStore({ stores: [
    { loadRelevant: async () => ({ files: { SOLUTIONS: 'verified fix' } }) },
    { loadRelevant: async () => ({ taskHistory: [{ status: 'failed' }] }) },
  ] });
  const result = await composite.loadRelevant({ request: 'test' });
  assert.equal(result.sources[0].files.SOLUTIONS, 'verified fix');
  assert.equal(result.sources[1].taskHistory[0].status, 'failed');
});
