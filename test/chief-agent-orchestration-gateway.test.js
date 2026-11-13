import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('agent-run automatically delegates a validated Chief Agent plan and persists live specialist events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-chief-dag-'));
  const calls = { profiles: [], plans: [], agentRuns: 0, events: [] };
  const availableAgents = [
    { id: 'researcher', name: 'Researcher', status: 'ACTIVE', mission: 'Research sources' },
    { id: 'builder', name: 'Builder', status: 'ACTIVE', mission: 'Build software' },
  ];
  const gateway = createTaskGateway({
    dataDir: root,
    token: 'chief-orchestration-token',
    agentFactory: {
      listAgents: async () => availableAgents,
      getExecutionProfile: async id => { calls.profiles.push(id); return { agentId: id, name: id, version: '1.0.0', allowedTools: ['read_file', 'finish_task'], resourceLimits: {} }; },
    },
    chiefAgent: {
      planTask: async input => {
        calls.plans.push(input);
        return {
          status: 'DRAFT_PLAN',
          plan: 'Parallel research then build.',
          orchestrationStatus: 'PROPOSED',
          orchestrationTasks: [
            { id: 'research', agentId: 'researcher', request: 'Research the open-source choices', dependsOn: [] },
            { id: 'build', agentId: 'builder', request: 'Build the selected solution', dependsOn: ['research'] },
          ],
        };
      },
    },
    multiAgentCoordinator: {
      executePlan: async ({ workspaceId, tasks, onProgress }) => {
        calls.events.push({ workspaceId, tasks });
        await onProgress({ type: 'agent.task.started', details: { taskId: 'research', agentId: 'researcher' } });
        await onProgress({ type: 'agent.step.started', details: { taskId: 'research', agentId: 'researcher', step: 1 } });
        await onProgress({ type: 'agent.task.completed', details: { taskId: 'research', agentId: 'researcher', evidenceCount: 1 } });
        return {
          status: 'completed',
          workspaceId,
          summary: { total: 2, succeeded: 2, failed: 0, skipped: 0 },
          tasks: [
            { id: 'research', agentId: 'researcher', status: 'succeeded', evidence: [{ id: 'research-proof' }] },
            { id: 'build', agentId: 'builder', status: 'succeeded', evidence: [{ id: 'build-proof' }] },
          ],
        };
      },
    },
    agentService: { runTask: async () => { calls.agentRuns += 1; throw new Error('single-agent path must not run'); } },
  });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer chief-orchestration-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'Build a local web product' }) });
    const task = await created.json();
    const run = await fetch(base + '/api/tasks/' + task.id + '/agent-run', {
      method: 'POST', headers, body: JSON.stringify({ confirmExecution: true }),
    });
    assert.equal(run.status, 200);
    const completed = await run.json();
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.result.orchestration.summary.succeeded, 2);
    assert.equal(completed.result.planning.orchestrationTaskCount, 2);
    assert.equal(calls.plans[0].availableAgents.length, 2);
    assert.equal(calls.agentRuns, 0);
    assert.equal(calls.events[0].tasks.length, 2);
    assert.ok(calls.events[0].tasks.every(item => item.workspaceId.length <= 64));
    assert.ok(calls.events[0].tasks.every(item => item.workspaceId !== calls.events[0].workspaceId));
    const progress = await fetch(base + '/api/tasks/' + task.id + '/events?after=1', { headers });
    const payload = await progress.json();
    assert.ok(payload.events.some(event => event.type === 'agent.task.started' && event.details.agentId === 'researcher'));
    assert.ok(payload.events.some(event => event.type === 'agent.step.started' && event.details.taskId === 'research'));
    assert.ok(payload.events.some(event => event.type === 'agent.task.completed' && event.details.agentId === 'researcher'));
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit specialist selection bypasses automatic DAG delegation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-chief-single-'));
  let coordinatorCalls = 0;
  let agentCalls = 0;
  const gateway = createTaskGateway({
    dataDir: root,
    token: 'chief-orchestration-token',
    agentFactory: {
      listAgents: async () => [{ id: 'builder', name: 'Builder', status: 'ACTIVE' }],
      getExecutionProfile: async id => ({ agentId: id, name: 'Builder', version: '1.0.0', allowedTools: ['read_file', 'finish_task'], resourceLimits: {} }),
    },
    chiefAgent: {
      planTask: async () => ({
        status: 'DRAFT_PLAN',
        plan: 'Direct specialist task.',
        orchestrationTasks: [
          { id: 'research', agentId: 'builder', request: 'Research', dependsOn: [] },
          { id: 'build', agentId: 'builder', request: 'Build', dependsOn: ['research'] },
        ],
      }),
    },
    multiAgentCoordinator: { executePlan: async () => { coordinatorCalls += 1; return { status: 'completed', summary: { total: 2, succeeded: 2, failed: 0, skipped: 0 }, tasks: [] }; } },
    agentService: { runTask: async input => { agentCalls += 1; assert.equal(input.allowedTools.includes('read_file'), true); return { completed: true, status: 'completed', summary: 'direct complete', steps: 1, evidence: [] }; } },
  });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer chief-orchestration-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'Run only builder' }) });
    const task = await created.json();
    const run = await fetch(base + '/api/tasks/' + task.id + '/agent-run', {
      method: 'POST', headers, body: JSON.stringify({ confirmExecution: true, agentId: 'builder' }),
    });
    assert.equal((await run.json()).status, 'succeeded');
    assert.equal(coordinatorCalls, 0);
    assert.equal(agentCalls, 1);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
