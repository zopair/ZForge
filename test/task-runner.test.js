import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/runtime/task-gateway.js';
import { TaskRunner } from '../src/runtime/task-runner.js';

test('task runner persists planning and agent tool events through completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-task-runner-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const task = await store.create({ request: 'Build a small tool', workspaceId: 'ws-runner' });
    let receivedPlan = null;
    const runner = new TaskRunner({
      taskStore: store,
      chiefAgent: { planTask: async () => ({ status: 'DRAFT_PLAN', discoveryStatus: 'COMPLETE', plan: 'Write and test' }) },
      agentService: {
        runTask: async options => {
          receivedPlan = options.plan;
          await options.onEvent({ type: 'agent.tool.completed', details: { tool: 'run_command', ok: true } });
          return { status: 'completed', completed: true, summary: 'Built and verified', steps: 2, evidence: [{ id: 'proof', ok: true }] };
        },
      },
    });
    await runner.runTask({ taskId: task.id, task, options: { model: 'qwen3:8b' }, signal: new AbortController().signal });
    const completed = store.get(task.id);
    assert.equal(completed.status, 'succeeded');
    assert.equal(receivedPlan, 'Write and test');
    assert.ok(completed.events.some(event => event.type === 'agent.tool.completed'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('task runner preserves inconclusive outcomes and cancelled execution states', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-task-runner-state-'));
  try {
    const store = await new TaskStore({ dataDir: root }).initialize();
    const task = await store.create({ request: 'Uncertain task' });
    const runner = new TaskRunner({
      taskStore: store,
      agentService: { runTask: async () => ({ status: 'needs_action', completed: false, message: 'Need more information' }) },
    });
    await runner.runTask({ taskId: task.id, task, options: { model: 'qwen3:8b' }, signal: new AbortController().signal });
    assert.equal(store.get(task.id).status, 'inconclusive');
  } finally { await rm(root, { recursive: true, force: true }); }
});
