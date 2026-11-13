import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';
import { AgentFactory } from '../src/core/agent-factory.js';

const manifest = {
  id: 'api-builder',
  name: 'API Builder',
  version: '1.0.0',
  status: 'PROPOSED',
  mission: 'Build workspace artifacts',
  nonGoals: ['Publish externally'],
  inputs: { request: 'string' },
  outputs: { artifact: 'object' },
  tools: [
    { id: 'run_command', capability: 'process-execution', version: '1.0.0', licenseEvidence: 'local' },
    { id: 'read_file', capability: 'workspace-read', version: '1.0.0', licenseEvidence: 'local' },
  ],
  permissions: { allow: ['test:run', 'workspace:read'], deny: ['secrets:read'], approvalRequired: ['external:publish'] },
  resourceLimits: { cpu: 1, memoryMb: 512, storageMb: 128, timeoutSeconds: 120 },
  tests: ['representative', 'edge', 'adversarial', 'missing-dependency', 'quota-exhaustion'],
  rollback: 'Deactivate the agent',
};

test('gateway exposes agent proposal, test, review, activation and scoped execution APIs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-agent-api-'));
  const agentFactory = new AgentFactory({ registry: new Map() });
  let executionOptions = null;
  const agentService = {
    listModels: async () => ['qwen3:8b'],
    runTask: async options => {
      executionOptions = options;
      return { status: 'completed', completed: true, summary: 'agent completed', steps: 1, evidence: [{ id: 'e1', ok: true }] };
    },
  };
  const chiefAgent = { planTask: async () => ({ status: 'DRAFT_PLAN', discoveryStatus: 'COMPLETE', plan: 'Build and verify' }) };
  const gateway = createTaskGateway({ dataDir: root, token: 'agent-gateway-test-token', agentFactory, agentService, chiefAgent });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const headers = { Authorization: 'Bearer agent-gateway-test-token', 'Content-Type': 'application/json' };
  try {
    const proposed = await fetch(`${base}/api/agents`, { method: 'POST', headers, body: JSON.stringify({ manifest, authorId: 'agent-author' }) });
    assert.equal(proposed.status, 201);
    for (const testName of manifest.tests) {
      const response = await fetch(`${base}/api/agents/api-builder/tests`, { method: 'POST', headers, body: JSON.stringify({ testName, status: 'passed', evidence: 'ci:passed', recordedBy: 'ci' }) });
      assert.equal(response.status, 200);
    }
    const review = await fetch(`${base}/api/agents/api-builder/reviews`, { method: 'POST', headers, body: JSON.stringify({ reviewerId: 'reviewer', licenseVerified: true, securityReviewed: true, permissionsReviewed: true }) });
    assert.equal(review.status, 200);
    const pending = await fetch(`${base}/api/agents/api-builder/activate`, { method: 'POST', headers, body: JSON.stringify({ approved: false, approverId: 'owner' }) });
    assert.equal((await pending.json()).activated, false);
    const activation = await fetch(`${base}/api/agents/api-builder/activate`, { method: 'POST', headers, body: JSON.stringify({ approved: true, approverId: 'owner' }) });
    assert.equal((await activation.json()).activated, true);
    const profile = await fetch(`${base}/api/agents/api-builder/profile`, { headers });
    assert.deepEqual((await profile.json()).allowedTools.sort(), ['finish_task', 'read_file', 'run_command']);
    const taskResponse = await fetch(`${base}/api/tasks`, { method: 'POST', headers, body: JSON.stringify({ request: 'Build with the specialist', workspaceId: 'ws-specialist' }) });
    const task = await taskResponse.json();
    const run = await fetch(`${base}/api/tasks/${task.id}/agent-run`, { method: 'POST', headers, body: JSON.stringify({ confirmExecution: true, agentId: 'api-builder', model: 'qwen3:8b' }) });
    const completed = await run.json();
    assert.equal(completed.status, 'succeeded');
    assert.equal(executionOptions.allowedTools.includes('run_command'), true);
    assert.equal(executionOptions.allowedTools.includes('write_file'), false);
    assert.equal(executionOptions.resourceLimits.timeoutSeconds, 120);
    const deactivated = await fetch(`${base}/api/agents/api-builder/deactivate`, { method: 'POST', headers, body: JSON.stringify({ approved: true, approverId: 'operator', reason: 'Regression rollback' }) });
    assert.equal((await deactivated.json()).status, 'RETIRED');
    const profileAfterRollback = await fetch(`${base}/api/agents/api-builder/profile`, { headers });
    assert.equal(profileAfterRollback.status, 409);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
