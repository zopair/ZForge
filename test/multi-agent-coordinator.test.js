import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiAgentCoordinator } from '../src/core/multi-agent-coordinator.js';

function setup({ maxParallel = 2, outcomes = {}, delay = 0 } = {}) {
  const calls = [];
  let active = 0;
  let peak = 0;
  const agentFactory = {
    getExecutionProfile: async agentId => ({
      agentId, allowedTools: ['read_file', 'run_command', 'finish_task'],
      resourceLimits: { cpu: 1, memoryMb: 512, timeoutSeconds: 30 },
    }),
  };
  const agentService = {
    runTask: async input => {
      calls.push(input);
      active += 1;
      peak = Math.max(peak, active);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      active -= 1;
      const outcome = outcomes[input.request];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? { completed: true, status: 'completed', summary: input.request + ' complete', evidence: [{ id: input.request + '-evidence' }] };
    },
  };
  return { coordinator: new MultiAgentCoordinator({ agentFactory, agentService, maxParallel }), calls, getPeak: () => peak };
}

test('coordinator executes independent agents concurrently and respects dependency order', async () => {
  const { coordinator, calls, getPeak } = setup({ maxParallel: 2, delay: 5 });
  const result = await coordinator.executePlan({
    workspaceId: 'project-1',
    tasks: [
      { id: 'research', agentId: 'researcher', request: 'Research the API' },
      { id: 'design', agentId: 'architect', request: 'Design the service' },
      { id: 'build', agentId: 'builder', request: 'Build the service', dependsOn: ['design'] },
    ],
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.tasks.length, 3);
  assert.ok(getPeak() <= 2);
  assert.ok(getPeak() > 1);
  const buildCall = calls.find(call => call.request === 'Build the service');
  assert.match(buildCall.plan, /Design the service complete/);
  assert.equal(buildCall.workspaceId, 'project-1-build');
});

test('coordinator preserves failures and skips only dependent tasks', async () => {
  const { coordinator, calls } = setup({ outcomes: { 'Fail this stage': new Error('compiler unavailable') } });
  const result = await coordinator.executePlan({
    workspaceId: 'project-2',
    tasks: [
      { id: 'broken', agentId: 'builder', request: 'Fail this stage' },
      { id: 'dependent', agentId: 'tester', request: 'Test the build', dependsOn: ['broken'] },
      { id: 'independent', agentId: 'researcher', request: 'Research alternatives' },
    ],
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.tasks.find(task => task.id === 'broken').status, 'failed');
  assert.equal(result.tasks.find(task => task.id === 'dependent').status, 'skipped');
  assert.equal(result.tasks.find(task => task.id === 'independent').status, 'succeeded');
  assert.equal(calls.some(call => call.request === 'Test the build'), false);
});

test('coordinator rejects unknown dependencies, duplicate IDs and cycles before execution', async () => {
  const { coordinator, calls } = setup();
  await assert.rejects(() => coordinator.executePlan({ workspaceId: 'x', tasks: [{ id: 'a', agentId: 'a', request: 'A', dependsOn: ['missing'] }] }), /unknown dependency/i);
  await assert.rejects(() => coordinator.executePlan({ workspaceId: 'x', tasks: [{ id: 'a', agentId: 'a', request: 'A' }, { id: 'a', agentId: 'b', request: 'B' }] }), /duplicate task id/i);
  await assert.rejects(() => coordinator.executePlan({ workspaceId: 'x', tasks: [{ id: 'a', agentId: 'a', request: 'A', dependsOn: ['b'] }, { id: 'b', agentId: 'b', request: 'B', dependsOn: ['a'] }] }), /cycle/i);
  assert.equal(calls.length, 0);
});

test('coordinator refuses inactive specialists and does not bypass profile permissions', async () => {
  const { coordinator, calls } = setup();
  const restricted = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async () => { throw new Error('agent must be independently activated'); } },
    agentService: { runTask: async input => { calls.push(input); } },
  });
  const result = await restricted.executePlan({ workspaceId: 'x', tasks: [{ id: 'a', agentId: 'draft-agent', request: 'Try execution' }] });
  assert.equal(result.status, 'failed');
  assert.equal(result.tasks[0].status, 'failed');
  assert.equal(calls.length, 0);
});

test('coordinator uses the configured local model when a task does not override it', async () => {
  let model;
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async () => ({ allowedTools: ['read_file', 'finish_task'], resourceLimits: {} }) },
    agentService: { runTask: async input => { model = input.model; return { completed: true, summary: 'done' }; } },
    defaultModel: 'qwen3:8b',
  });
  await coordinator.executePlan({ workspaceId: 'model-default', tasks: [{ id: 'one', agentId: 'reader', request: 'Read docs' }] });
  assert.equal(model, 'qwen3:8b');
});
