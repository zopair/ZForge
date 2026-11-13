import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

async function withGateway(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-approved-plan-'));
  const token = 'zforge-test-token-0123456789';
  const gateway = createTaskGateway({
    dataDir,
    token,
    runtime: { createWorkspace: async () => ({}) },
    agentService: { runTask: async input => ({ completed: true, status: 'completed', summary: 'verified', steps: 1, evidence: [], receivedPlan: input.plan }) },
    chiefAgent: { planTask: async () => { throw new Error('approved execution must not regenerate the plan'); } },
  });
  await gateway.ready;
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const baseUrl = 'http://127.0.0.1:' + gateway.server.address().port;
  try { await run({ baseUrl, token }); }
  finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('agent execution consumes the exact approved plan snapshot without regenerating it', async () => {
  await withGateway(async ({ baseUrl, token }) => {
    const taskResponse = await fetch(baseUrl + '/api/tasks', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Build a verified tool' }),
    });
    const task = await taskResponse.json();
    const approvedPlan = { plan: 'Exact approved implementation instructions', requiresApproval: true, executionStarted: false };
    const serialized = JSON.stringify(approvedPlan);
    const digest = createHash('sha256').update(serialized).digest('hex');
    const response = await fetch(baseUrl + '/api/tasks/' + task.id + '/agent-run', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmExecution: true, approvedPlan: serialized, approvedPlanSha256: digest }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.result.receivedPlan, approvedPlan.plan);
  });
});

test('agent gateway rejects an approved plan whose fingerprint does not match its contents', async () => {
  await withGateway(async ({ baseUrl, token }) => {
    const taskResponse = await fetch(baseUrl + '/api/tasks', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Build a verified tool' }),
    });
    const task = await taskResponse.json();
    const serialized = JSON.stringify({ plan: 'changed plan', requiresApproval: true, executionStarted: false });
    const response = await fetch(baseUrl + '/api/tasks/' + task.id + '/agent-run', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmExecution: true, approvedPlan: serialized, approvedPlanSha256: '0'.repeat(64) }),
    });
    const result = await response.json();
    assert.equal(response.status, 409);
    assert.equal(result.error, 'approved_plan_fingerprint_mismatch');
  });
});
