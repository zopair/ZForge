import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentExecutionService } from '../src/core/agent-execution-service.js';

test('agent executes model-selected workspace tools and completes only with successful evidence', async () => {
  const calls = [];
  const runtime = {
    createWorkspace: async ({ id }) => ({ id }),
    execute: async input => { calls.push(input); return { exitCode: 0, stdout: 'tests passed', stderr: '', outputTruncated: false }; },
    readFile: async () => ({ content: 'source' }),
    writeFile: async () => ({ bytes: 6 }),
    listFiles: async () => [],
  };
  let turn = 0;
  const modelAdapter = {
    chat: async ({ messages, tools }) => {
      assert.ok(tools.some(tool => tool.function.name === 'run_command'));
      turn += 1;
      if (turn === 1) return {
        content: '',
        toolCalls: [{ id: 'call-run', name: 'run_command', arguments: { command: process.execPath, args: ['--version'] } }],
        rawToolCalls: [{ id: 'call-run', function: { name: 'run_command', arguments: { command: process.execPath, args: ['--version'] } } }],
      };
      const toolResult = messages.find(message => message.role === 'tool');
      const evidence = JSON.parse(toolResult.content);
      return {
        content: '',
        toolCalls: [{ id: 'call-finish', name: 'finish_task', arguments: { summary: 'Verified command execution', evidenceIds: [evidence.id] } }],
        rawToolCalls: [{ id: 'call-finish', function: { name: 'finish_task', arguments: { summary: 'Verified command execution', evidenceIds: [evidence.id] } } }],
      };
    },
  };
  const agent = new AgentExecutionService({ modelAdapter, runtime, maxSteps: 4 });
  const result = await agent.runTask({ request: 'Run the local verification command', model: 'qwen3:8b', workspaceId: 'ws-agent' });
  assert.equal(result.status, 'completed');
  assert.equal(result.summary, 'Verified command execution');
  assert.equal(result.evidence.length, 1);
  assert.equal(calls.length, 1);
});

test('agent cannot mark a task complete with missing or unsuccessful evidence', async () => {
  const runtime = { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 1, stdout: '', stderr: 'failed' }) };
  const modelAdapter = { chat: async () => ({
    content: '',
    toolCalls: [{ name: 'finish_task', arguments: { summary: 'Pretend success', evidenceIds: ['invented'] } }],
  }) };
  const agent = new AgentExecutionService({ modelAdapter, runtime });
  const result = await agent.runTask({ request: 'Do work', model: 'local', workspaceId: 'ws-check' });
  assert.notEqual(result.status, 'completed');
  assert.equal(result.completed, false);
});

test('agent returns a non-completed state when the model does not provide a tool call', async () => {
  const agent = new AgentExecutionService({
    modelAdapter: { chat: async () => ({ content: 'Here is a suggestion.', toolCalls: [] }) },
    runtime: { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 0 }) },
  });
  const result = await agent.runTask({ request: 'Do work', model: 'local', workspaceId: 'ws-idle' });
  assert.equal(result.status, 'needs_action');
  assert.equal(result.completed, false);
});

test('agent execution records experiment outcomes and tool observations in the workspace manager', async () => {
  const { AgentWorkspaceManager } = await import('../src/core/agent-workspace-manager.js');
  const workspaceManager = new AgentWorkspaceManager();
  const runtime = {
    createWorkspace: async ({ id }) => ({ id }),
    execute: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
  };
  const modelAdapter = { chat: async ({ messages }) => {
    if (messages.some(message => message.role === 'tool')) {
      const result = JSON.parse(messages.find(message => message.role === 'tool').content);
      return { toolCalls: [{ name: 'finish_task', arguments: { summary: 'Verified by command', evidenceIds: [result.id] } }] };
    }
    return { toolCalls: [{ name: 'run_command', arguments: { command: process.execPath, args: ['--version'] } }] };
  } };
  const agent = new AgentExecutionService({ modelAdapter, runtime, workspaceManager });
  const result = await agent.runTask({ request: 'Verify runtime', model: 'local', workspaceId: 'ws-managed' });
  const workspace = workspaceManager.getWorkspace('ws-managed');
  assert.equal(result.completed, true);
  assert.equal(workspace.experiments[0].status, 'succeeded');
  assert.equal(workspace.observations.length, 1);
});

test('agent can publish a verified workspace artifact into the durable artifact store', async () => {
  let published = null;
  const artifactStore = {
    publishFromWorkspace: async input => { published = input; return { id: 'artifact-123', filename: 'app.apk', kind: 'apk', sha256: 'abc', sizeBytes: 7 }; },
  };
  let turn = 0;
  const modelAdapter = { chat: async ({ messages, tools }) => {
    assert.ok(tools.some(tool => tool.function.name === 'publish_artifact'));
    turn += 1;
    if (turn === 1) return { toolCalls: [{ id: 'publish-1', name: 'publish_artifact', arguments: { sourcePath: 'build/app.apk', filename: 'app.apk', kind: 'apk' } }] };
    const evidence = JSON.parse(messages.find(message => message.role === 'tool').content);
    return { toolCalls: [{ id: 'finish-1', name: 'finish_task', arguments: { summary: 'APK saved', evidenceIds: [evidence.id] } }] };
  } };
  const runtime = { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 0 }) };
  const agent = new AgentExecutionService({ modelAdapter, runtime, artifactStore });
  const result = await agent.runTask({ request: 'Build and save APK', model: 'local', workspaceId: 'ws-artifact' });
  assert.equal(result.completed, true);
  assert.equal(published.sourcePath, 'build/app.apk');
  assert.equal(published.filename, 'app.apk');
  assert.equal(result.evidence[0].artifact.id, 'artifact-123');
});
