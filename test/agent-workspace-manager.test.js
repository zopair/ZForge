import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentWorkspaceManager, WORKSPACE_STATES, EXPERIMENT_STATES } from '../src/core/agent-workspace-manager.js';

function manager() {
  let tick = 0;
  return new AgentWorkspaceManager({ clock: () => new Date(1_800_000_000_000 + tick++).toISOString() });
}

test('creates an experimental workspace with broad capabilities by default', () => {
  const workspaces = manager();
  const workspace = workspaces.createWorkspace({ id: 'ws-1', name: 'Research bench', agentId: 'researcher' });
  assert.equal(workspace.mode, 'experimental');
  assert.equal(workspace.status, 'ready');
  assert.ok(workspace.capabilities.includes('terminal'));
  assert.ok(workspace.capabilities.includes('package-install'));
  assert.ok(workspace.capabilities.includes('network-research'));
  assert.ok(workspace.capabilities.includes('browser'));
  assert.equal(workspace.resources.strategy, 'adaptive');
  assert.equal(workspace.collaboration.enabled, true);
});

test('allows agents to extend capabilities and tune their own workspace profile', () => {
  const workspace = manager().createWorkspace({
    id: 'ws-2', name: 'GPU lab', agentId: 'builder', profile: 'gpu-experiment',
    capabilities: ['gpu', 'custom-runtime', 'network-research'],
    environment: { python: '3.12', accelerator: 'available-if-hosted' },
    resources: { requested: { memoryMb: 8192 }, strategy: 'best-effort' },
  });
  assert.equal(workspace.profile, 'gpu-experiment');
  assert.ok(workspace.capabilities.includes('gpu'));
  assert.equal(workspace.capabilities.filter(item => item === 'network-research').length, 1);
  assert.equal(workspace.resources.requested.memoryMb, 8192);
});

test('keeps workspace state and observations available as engineering history', () => {
  const workspaces = manager();
  workspaces.createWorkspace({ id: 'ws-3', name: 'Lab', agentId: 'agent-a' });
  workspaces.setWorkspaceStatus('ws-3', 'paused');
  workspaces.addObservation('ws-3', { id: 'obs-1', kind: 'failure', note: 'Variant B failed under load', evidence: [{ metric: 'latency', value: 900 }] });
  assert.equal(workspaces.getWorkspace('ws-3').status, 'paused');
  assert.equal(workspaces.getWorkspace('ws-3').observations[0].kind, 'failure');
  assert.equal(workspaces.listWorkspaces({ agentId: 'agent-a', status: 'paused' }).length, 1);
});

test('records experiments, failures and successful outcomes without discarding either', () => {
  const workspaces = manager();
  workspaces.createWorkspace({ id: 'ws-4', name: 'Experiments', agentId: 'agent-b' });
  workspaces.startExperiment('ws-4', { id: 'exp-fail', title: 'Alternative parser', hypothesis: 'Parser B handles malformed input better', variants: ['A', 'B'] });
  workspaces.finishExperiment('ws-4', 'exp-fail', { outcome: 'failed', findings: ['B regressed on Unicode corpus'] });
  workspaces.startExperiment('ws-4', { id: 'exp-win', title: 'Cache strategy', hypothesis: 'Local cache reduces repeat work' });
  workspaces.finishExperiment('ws-4', 'exp-win', { outcome: 'succeeded', findings: ['Latency improved by 35%'], metrics: { improvementPercent: 35 }, artifacts: ['benchmarks/cache.json'] });
  const experiments = workspaces.getWorkspace('ws-4').experiments;
  assert.deepEqual(experiments.map(item => item.status), ['failed', 'succeeded']);
  assert.equal(experiments[1].outcome.metrics.improvementPercent, 35);
  assert.equal(experiments[0].findings[0], 'B regressed on Unicode corpus');
});

test('promotes successful experiments and refuses to promote unsuccessful ones', () => {
  const workspaces = manager();
  workspaces.createWorkspace({ id: 'ws-5', name: 'Promotion lab', agentId: 'agent-c' });
  workspaces.startExperiment('ws-5', { id: 'exp-1', title: 'Tool prototype', hypothesis: 'Prototype solves missing capability' });
  assert.throws(() => workspaces.promoteExperiment('ws-5', 'exp-1'), /successful experiments/);
  workspaces.finishExperiment('ws-5', 'exp-1', { outcome: 'succeeded', findings: ['Acceptance suite passed'] });
  const promoted = workspaces.promoteExperiment('ws-5', 'exp-1', { target: 'tool-registry' });
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.promotionTarget, 'tool-registry');
  assert.ok(promoted.promotedAt);
});

test('rejects duplicate workspace and experiment identities and invalid lifecycle values', () => {
  const workspaces = manager();
  workspaces.createWorkspace({ id: 'ws-6', name: 'Lab', agentId: 'agent-d' });
  assert.throws(() => workspaces.createWorkspace({ id: 'ws-6', name: 'Duplicate', agentId: 'agent-d' }), /already exists/);
  assert.throws(() => workspaces.setWorkspaceStatus('ws-6', 'deleted'), /unsupported workspace status/);
  workspaces.startExperiment('ws-6', { id: 'exp-1', title: 'One', hypothesis: 'Test' });
  assert.throws(() => workspaces.startExperiment('ws-6', { id: 'exp-1', title: 'Duplicate', hypothesis: 'Test' }), /already exists/);
  assert.deepEqual([...WORKSPACE_STATES], ['ready', 'active', 'paused', 'archived']);
  assert.deepEqual([...EXPERIMENT_STATES], ['running', 'succeeded', 'failed', 'inconclusive', 'promoted']);
});
