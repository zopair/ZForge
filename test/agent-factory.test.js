import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFactory } from '../src/core/agent-factory.js';
import { LocalAgentRegistry } from '../src/runtime/local-agent-registry.js';

const manifest = (overrides = {}) => ({
  id: 'builder-agent',
  name: 'Builder Agent',
  version: '1.0.0',
  status: 'PROPOSED',
  mission: 'Build and verify workspace artifacts',
  nonGoals: ['Publish releases', 'Change global permissions'],
  inputs: { request: 'string' },
  outputs: { artifact: 'object' },
  tools: [
    { id: 'run_command', capability: 'process-execution', version: '1.0.0', licenseEvidence: 'local-runtime' },
    { id: 'read_file', capability: 'workspace-read', version: '1.0.0', licenseEvidence: 'local-runtime' },
    { id: 'publish_artifact', capability: 'artifact-publish', version: '1.0.0', licenseEvidence: 'local-runtime' },
  ],
  permissions: { allow: ['test:run', 'workspace:read', 'artifact:publish'], deny: ['repository:merge-main', 'secrets:read'], approvalRequired: ['external:publish'] },
  resourceLimits: { cpu: 2, memoryMb: 2048, storageMb: 1024, timeoutSeconds: 900 },
  tests: ['representative', 'edge', 'adversarial', 'missing-dependency', 'quota-exhaustion'],
  rollback: 'Deactivate the agent and restore the previous manifest',
  ...overrides,
});
const requiredTests = ['representative', 'edge', 'adversarial', 'missing-dependency', 'quota-exhaustion'];

test('factory keeps new agents proposed until required tests, reviews and independent approval', async () => {
  const factory = new AgentFactory({ registry: new Map() });
  const proposed = await factory.proposeAgent({ manifest: manifest(), authorId: 'agent-author' });
  assert.equal(proposed.status, 'PROPOSED');
  assert.equal(proposed.manifest.status, 'PROPOSED');
  for (const testName of requiredTests) {
    await factory.recordTestResult({ agentId: 'builder-agent', testName, status: 'passed', evidence: 'ci:passed', recordedBy: 'ci-runner' });
  }
  await factory.recordReview({ agentId: 'builder-agent', reviewerId: 'independent-reviewer', licenseVerified: true, securityReviewed: true, permissionsReviewed: true });
  const eligible = await factory.evaluateActivation('builder-agent');
  assert.equal(eligible.eligibleForActivation, true);
  assert.equal(eligible.status, 'APPROVAL_REQUIRED');
  const pending = await factory.activate({ agentId: 'builder-agent', approved: false, approverId: 'owner' });
  assert.equal(pending.activated, false);
  await assert.rejects(() => factory.activate({ agentId: 'builder-agent', approved: true, approverId: 'agent-author' }), /independent/i);
  await assert.rejects(() => factory.activate({ agentId: 'builder-agent', approved: true, approverId: 'independent-reviewer' }), /independent/i);
  const active = await factory.activate({ agentId: 'builder-agent', approved: true, approverId: 'owner' });
  assert.equal(active.activated, true);
  assert.equal(active.status, 'ACTIVE');
  const profile = await factory.getExecutionProfile('builder-agent');
  assert.deepEqual(profile.allowedTools.sort(), ['publish_artifact', 'read_file', 'run_command']);
});

test('factory blocks failed or missing tests and unresolved reviews', async () => {
  const factory = new AgentFactory({ registry: new Map() });
  await factory.proposeAgent({ manifest: manifest(), authorId: 'author' });
  for (const testName of requiredTests) {
    await factory.recordTestResult({ agentId: 'builder-agent', testName, status: testName === 'adversarial' ? 'failed' : 'passed', evidence: 'test log', recordedBy: 'ci' });
  }
  await factory.recordReview({ agentId: 'builder-agent', reviewerId: 'reviewer', licenseVerified: true, securityReviewed: null, permissionsReviewed: true });
  const evaluation = await factory.evaluateActivation('builder-agent');
  assert.equal(evaluation.eligibleForActivation, false);
  assert.ok(evaluation.blockers.some(blocker => blocker.includes('adversarial')));
  assert.ok(evaluation.blockers.includes('SECURITY_NOT_REVIEWED'));
  const result = await factory.activate({ agentId: 'builder-agent', approved: true, approverId: 'owner' });
  assert.equal(result.activated, false);
});

test('factory rejects author self-review and unsafe tool permissions', async () => {
  const factory = new AgentFactory({ registry: new Map() });
  await factory.proposeAgent({ manifest: manifest(), authorId: 'author' });
  await assert.rejects(() => factory.recordReview({ agentId: 'builder-agent', reviewerId: 'author', licenseVerified: true, securityReviewed: true, permissionsReviewed: true }), /independent reviewer/i);
  await assert.rejects(() => factory.proposeAgent({ manifest: manifest({ id: 'unsafe-agent', permissions: { allow: ['secrets:read'], deny: [], approvalRequired: [] } }), authorId: 'author' }), /privileged/i);
});

test('local agent registry persists proposed and active agent records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-agent-registry-'));
  try {
    const registry = await new LocalAgentRegistry({ dataDir: root }).initialize();
    const factory = new AgentFactory({ registry });
    await factory.proposeAgent({ manifest: manifest(), authorId: 'author' });
    const reopened = await new LocalAgentRegistry({ dataDir: root }).initialize();
    assert.equal(reopened.get('builder-agent').status, 'PROPOSED');
    assert.equal(reopened.list().length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
