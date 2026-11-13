import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/runtime/task-gateway.js';
import { TaskScheduler } from '../src/runtime/task-scheduler.js';

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('condition timed out');
}

test('task store appends durable ordered progress events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-events-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const task = await store.create({ request: 'Record progress' });
    await store.appendEvent(task.id, 'agent.plan.completed', { candidates: 3 });
    await store.appendEvent(task.id, 'agent.tool.completed', { tool: 'run_command' });
    const reopened = await new TaskStore({ dataDir: root }).initialize();
    assert.deepEqual(reopened.get(task.id).events.map(event => event.type), ['task.queued', 'agent.plan.completed', 'agent.tool.completed']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scheduler resumes durable queued tasks and respects concurrency ceiling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-scheduler-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const tasks = await Promise.all(['one', 'two', 'three', 'four'].map(request => store.create({ request })));
    let active = 0;
    let maximum = 0;
    const scheduler = new TaskScheduler({
      taskStore: store,
      maxConcurrent: 2,
      runTask: async ({ task }) => {
        await store.transition(task.id, 'running');
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 25));
        await store.transition(task.id, 'succeeded', { result: { completed: true } });
        active -= 1;
      },
    });
    await scheduler.start();
    await waitFor(() => tasks.every(task => ['succeeded', 'failed', 'cancelled'].includes(store.get(task.id).status)));
    assert.equal(maximum, 2);
    assert.equal(scheduler.status().active, 0);
    await scheduler.stop();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scheduler cancels queued tasks without running them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-cancel-queued-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const first = await store.create({ request: 'Long task' });
    const second = await store.create({ request: 'Queued task' });
    let release;
    const blocker = new Promise(resolve => { release = resolve; });
    const scheduler = new TaskScheduler({
      taskStore: store,
      maxConcurrent: 1,
      runTask: async ({ task }) => {
        await store.transition(task.id, 'running');
        if (task.id === first.id) await blocker;
        await store.transition(task.id, 'succeeded');
      },
    });
    await scheduler.start();
    await waitFor(() => store.get(first.id).status === 'running');
    const cancelled = await scheduler.cancel(second.id);
    assert.equal(cancelled.status, 'cancelled');
    release();
    await waitFor(() => store.get(first.id).status === 'succeeded');
    await scheduler.stop();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('scheduler aborts a running task through its AbortSignal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-cancel-running-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const task = await store.create({ request: 'Abort me' });
    const scheduler = new TaskScheduler({
      taskStore: store,
      runTask: async ({ task: current, signal }) => {
        await store.transition(current.id, 'running');
        await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
        await store.transition(current.id, 'cancelled', { error: 'cancelled by caller' });
      },
    });
    await scheduler.start();
    await waitFor(() => store.get(task.id).status === 'running');
    await scheduler.cancel(task.id);
    await waitFor(() => store.get(task.id).status === 'cancelled');
    await scheduler.stop();
  } finally { await rm(root, { recursive: true, force: true }); }
});
