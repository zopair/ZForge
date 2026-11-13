import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';
import { AgentExecutionService } from '../src/core/agent-execution-service.js';

test('agent execution reports step, tool and verified completion events without leaking tool arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-agent-progress-'));
  const runtime = await new LocalExecutionRuntime({ rootDir: root }).initialize();
  const responses = [
    { toolCalls: [{ id: 'command-evidence', name: 'run_command', arguments: { command: process.execPath, args: ['-e', 'process.stdout.write("ok")'] } }] },
    { toolCalls: [{ id: 'finish-evidence', name: 'finish_task', arguments: { summary: 'Verified local command', evidenceIds: ['command-evidence'] } }] },
  ];
  const service = new AgentExecutionService({
    modelAdapter: { chat: async () => responses.shift() },
    runtime,
    maxSteps: 4,
  });
  const events = [];
  try {
    const result = await service.runTask({
      request: 'Run and verify a local command',
      model: 'local-test',
      workspaceId: 'progress-workspace',
      onProgress: async event => events.push(event),
    });
    assert.equal(result.completed, true);
    assert.ok(events.some(event => event.type === 'agent.step.started' && event.details.step === 1));
    assert.ok(events.some(event => event.type === 'agent.tool.started' && event.details.toolName === 'run_command'));
    assert.ok(events.some(event => event.type === 'agent.tool.completed' && event.details.ok === true));
    assert.ok(events.some(event => event.type === 'agent.completed'));
    assert.equal(JSON.stringify(events).includes('process.stdout.write'), false);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});
