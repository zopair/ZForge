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
