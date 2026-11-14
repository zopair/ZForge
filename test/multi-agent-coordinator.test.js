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

test('coordinator forwards live specialist events with agent and task identity', async () => {
  const events = [];
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async agentId => ({ agentId, allowedTools: ['read_file', 'finish_task'], resourceLimits: {} }) },
    agentService: {
      runTask: async ({ onProgress }) => {
        await onProgress({ type: 'agent.step.started', details: { step: 1 } });
        return { completed: true, summary: 'specialist verified', evidence: [{ id: 'proof' }] };
      },
    },
  });
  const result = await coordinator.executePlan({
    workspaceId: 'live-events',
    tasks: [{ id: 'research', agentId: 'researcher', request: 'Research the component' }],
    onProgress: async event => events.push(event),
  });
  assert.equal(result.status, 'completed');
  assert.ok(events.some(event => event.type === 'agent.task.started' && event.details.agentId === 'researcher'));
  assert.ok(events.some(event => event.type === 'agent.step.started' && event.details.taskId === 'research' && event.details.agentId === 'researcher'));
  assert.ok(events.some(event => event.type === 'agent.task.completed' && event.details.taskId === 'research'));
});

test('coordinator selects a specialist model by role and records the selected route', async () => {
  let model;
  const events = [];
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async () => ({ allowedTools: ['read_file'], resourceLimits: {} }) },
    modelRouter: { initialized: true, resolve: ({ role }) => ({ model: role === 'coding' ? 'coder-local' : 'general-local', role, fallback: false, reason: null }) },
    agentService: { runTask: async input => { model = input.model; return { completed: true, summary: 'verified' }; } },
  });
  const result = await coordinator.executePlan({
    workspaceId: 'hive-routing',
    tasks: [{ id: 'implement', agentId: 'builder', modelRole: 'coding', request: 'Implement the module' }],
    onProgress: async event => events.push(event),
  });
  assert.equal(result.status, 'completed');
  assert.equal(model, 'coder-local');
  assert.equal(result.tasks[0].model, 'coder-local');
  assert.ok(events.some(event => event.type === 'agent.model.selected' && event.details.model === 'coder-local'));
});

test('coordinator validates specialist model roles before execution', async () => {
  let called = false;
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async () => ({ allowedTools: [], resourceLimits: {} }) },
    agentService: { runTask: async () => { called = true; return { completed: true }; } },
  });
  await assert.rejects(() => coordinator.executePlan({
    workspaceId: 'invalid-role',
    tasks: [{ id: 'bad', agentId: 'builder', modelRole: 'Bad Role', request: 'Do work' }],
  }), /modelRole is invalid/i);
  assert.equal(called, false);
});

test('reviewed coding tasks require independent review, bounded repair, and a separate QA pass', async () => {
  const calls = [];
  const events = [];
  let reviews = 0;
  const profiles = {
    builder: { allowedTools: ['read_file', 'write_file', 'run_command', 'finish_task'], resourceLimits: {} },
    reviewer: { allowedTools: ['read_file', 'list_files', 'finish_task'], resourceLimits: {} },
    qa: { allowedTools: ['read_file', 'list_files', 'run_command', 'finish_task'], resourceLimits: {} },
  };
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async agentId => profiles[agentId] },
    modelRouter: {
      initialized: true,
      routes: { review: 'review-model', qa: 'qa-model' },
      resolve: ({ role }) => ({ model: role === 'coding' ? 'coder-model' : 'qa-model', role, fallback: false, reason: null }),
      resolveIndependentReview: ({ authorModel }) => ({ model: authorModel === 'coder-model' ? 'review-model' : 'qa-model', independent: true }),
    },
    agentService: { runTask: async input => {
      calls.push(input);
      if (input.assessmentContract?.kind === 'review') {
        reviews += 1;
        return { completed: true, summary: 'Review complete', evidence: [{ id: 'review-' + reviews }], assessment: reviews === 1
          ? { decision: 'changes_requested', findings: ['Handle empty input before parsing.'] }
          : { decision: 'approved', findings: [] } };
      }
      if (input.assessmentContract?.kind === 'qa') {
        return { completed: true, summary: 'Tests passed', evidence: [{ id: 'qa-command', name: 'run_command', ok: true }], assessment: { decision: 'approved', findings: [] } };
      }
      return { completed: true, summary: 'Implementation iteration ' + calls.filter(call => !call.assessmentContract).length, evidence: [{ id: 'author-' + calls.length }] };
    } },
  });
  const result = await coordinator.executePlan({
    workspaceId: 'review-lifecycle',
    tasks: [{
      id: 'implementation', agentId: 'builder', modelRole: 'coding', request: 'Implement parser',
      review: { reviewerAgentId: 'reviewer', qaAgentId: 'qa', maxIterations: 1 },
    }],
    onProgress: async event => events.push(event),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.tasks[0].review.decision, 'approved');
  assert.equal(result.tasks[0].qa.decision, 'approved');
  assert.equal(result.tasks[0].reviewIterations, 2);
  assert.equal(calls.filter(call => !call.assessmentContract).length, 2);
  assert.equal(calls.find(call => call.assessmentContract?.kind === 'review').allowedTools.includes('write_file'), false);
  assert.equal(calls.find(call => call.assessmentContract?.kind === 'qa').allowedTools.includes('run_command'), true);
  assert.ok(events.some(event => event.type === 'agent.review.changes_requested'));
  assert.ok(events.some(event => event.type === 'agent.qa.completed'));
});

test('reviewed coding task fails closed when independent reviewer profile can modify the workspace', async () => {
  let executed = false;
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async agentId => ({
      allowedTools: agentId === 'reviewer' ? ['read_file', 'write_file', 'finish_task'] : ['read_file', 'run_command', 'finish_task'],
      resourceLimits: {},
    }) },
    modelRouter: {
      initialized: true,
      resolve: () => ({ model: 'coder-model', role: 'coding' }),
      resolveIndependentReview: () => ({ model: 'review-model', independent: true }),
    },
    agentService: { runTask: async () => { executed = true; return { completed: true }; } },
  });
  const result = await coordinator.executePlan({
    workspaceId: 'unsafe-review',
    tasks: [{ id: 'implementation', agentId: 'builder', request: 'Implement', review: { reviewerAgentId: 'reviewer', qaAgentId: 'qa' } }],
  });
  assert.equal(result.status, 'failed');
  assert.match(result.tasks[0].reason, /read-only/i);
  assert.equal(executed, false);
});

test('reviewed coding task cannot pass when QA assessment is missing or unsuccessful', async () => {
  const coordinator = new MultiAgentCoordinator({
    agentFactory: { getExecutionProfile: async agentId => ({
      allowedTools: agentId === 'reviewer' ? ['read_file', 'list_files', 'finish_task'] : ['read_file', 'run_command', 'finish_task'],
      resourceLimits: {},
    }) },
    modelRouter: {
      initialized: true,
      resolve: ({ role }) => ({ model: role === 'coding' ? 'coder-model' : 'qa-model', role }),
      resolveIndependentReview: ({ authorModel }) => ({ model: authorModel === 'coder-model' ? 'review-model' : 'qa-model', independent: true }),
    },
    agentService: { runTask: async input => input.assessmentContract?.kind === 'review'
      ? { completed: true, summary: 'approved', evidence: [{ id: 'r' }], assessment: { decision: 'approved', findings: [] } }
      : input.assessmentContract?.kind === 'qa'
        ? { completed: true, summary: 'No command evidence', evidence: [{ id: 'read' }], assessment: { decision: 'approved', findings: [] } }
        : { completed: true, summary: 'implemented', evidence: [{ id: 'a' }] } },
  });
  const result = await coordinator.executePlan({
    workspaceId: 'qa-fails-closed',
    tasks: [{ id: 'implementation', agentId: 'builder', request: 'Implement', review: { reviewerAgentId: 'reviewer', qaAgentId: 'qa' } }],
  });
  assert.equal(result.status, 'failed');
  assert.match(result.tasks[0].reason, /QA|quality|command/i);
});
