import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentAgentWorkspaceManager } from '../src/runtime/persistent-agent-workspace-manager.js';

test('workspace experiments and observations survive runtime restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-workspace-memory-'));
  try {
    const manager = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    await manager.createWorkspace({ id: 'ws-memory', name: 'Memory Workspace', agentId: 'builder', purpose: 'Test persistence' });
    await manager.startExperiment('ws-memory', { id: 'exp-1', title: 'Build attempt', hypothesis: 'Build can pass' });
    await manager.addObservation('ws-memory', { id: 'obs-1', kind: 'tool-result', note: 'Gradle test failed', evidence: [{ exitCode: 1 }] });
    await manager.finishExperiment('ws-memory', 'exp-1', { outcome: 'failed', findings: ['Missing SDK platform'], metrics: { durationMs: 12 } });
    const reopened = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    const workspace = await reopened.getWorkspace('ws-memory');
    assert.equal(workspace.experiments[0].status, 'failed');
    assert.equal(workspace.experiments[0].findings[0], 'Missing SDK platform');
    assert.equal(workspace.observations[0].note, 'Gradle test failed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('persistent workspace manager serializes concurrent updates without losing observations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-workspace-concurrency-'));
  try {
    const manager = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    await manager.createWorkspace({ id: 'ws-concurrent', name: 'Concurrent', agentId: 'chief' });
    await Promise.all(Array.from({ length: 20 }, (_, index) => manager.addObservation('ws-concurrent', {
      id: 'obs-' + index, note: 'Observation ' + index,
    })));
    const reopened = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    assert.equal((await reopened.getWorkspace('ws-concurrent')).observations.length, 20);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('persistent workspace manager rejects symlinked or malformed state files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-workspace-invalid-'));
  const target = join(root, 'outside.json');
  try {
    await writeFile(target, '[]');
    await symlink(target, join(root, 'workspaces.json'));
    await assert.rejects(() => new PersistentAgentWorkspaceManager({ dataDir: root }).initialize(), /symbolic link/i);
    await rm(join(root, 'workspaces.json'));
    await writeFile(join(root, 'workspaces.json'), '{broken');
    await assert.rejects(() => new PersistentAgentWorkspaceManager({ dataDir: root }).initialize(), /JSON|position|property/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('persistent workspace manager refuses invalid restored lifecycle records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-workspace-state-'));
  try {
    await writeFile(join(root, 'workspaces.json'), JSON.stringify([{ id: 'bad', status: 'unknown' }]));
    await assert.rejects(() => new PersistentAgentWorkspaceManager({ dataDir: root }).initialize(), /invalid workspace record/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('AgentExecutionService awaits and persists its verified experiment and tool evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-workspace-agent-run-'));
  try {
    const { AgentExecutionService } = await import('../src/core/agent-execution-service.js');
    const workspaceManager = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    let turn = 0;
    const agent = new AgentExecutionService({
      workspaceManager,
      runtime: { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }) },
      modelAdapter: { chat: async ({ messages }) => {
        turn += 1;
        if (turn === 1) return { toolCalls: [{ id: 'persisted-run', name: 'run_command', arguments: { command: 'node', args: ['--version'] } }] };
        const evidence = JSON.parse(messages.find(message => message.role === 'tool').content);
        return { toolCalls: [{ name: 'finish_task', arguments: { summary: 'Verified durable run', evidenceIds: [evidence.id] } }] };
      } },
    });
    const result = await agent.runTask({ request: 'Verify persistent memory', model: 'local', workspaceId: 'ws-agent-persist' });
    assert.equal(result.completed, true);
    const reopened = await new PersistentAgentWorkspaceManager({ dataDir: root }).initialize();
    const workspace = await reopened.getWorkspace('ws-agent-persist');
    assert.equal(workspace.experiments[0].status, 'succeeded');
    assert.equal(workspace.observations[0].id, 'persisted-run');
  } finally { await rm(root, { recursive: true, force: true }); }
});
