import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentExecutionService } from '../src/core/agent-execution-service.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

test('web tools are available only with an explicit allowlist and a task budget', async () => {
  let toolsSeen = [];
  const agent = new AgentExecutionService({
    modelAdapter: { chat: async ({ tools }) => { toolsSeen = tools.map(item => item.function.name); return { content: 'waiting', toolCalls: [] }; } },
    runtime: { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 0 }) },
    knowledgeGateway: { search: async () => ({ markdown: 'result' }), fetch: async () => ({ markdown: 'page' }) },
  });
  await agent.runTask({ request: 'Research', model: 'local', workspaceId: 'ws-no-web' });
  assert.equal(toolsSeen.includes('web_search'), false);
  await agent.runTask({ request: 'Research', model: 'local', workspaceId: 'ws-web', allowedTools: ['web_search'], webBudget: new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } }) });
  assert.equal(toolsSeen.includes('web_search'), true);
});

test('web search is routed through the Knowledge Gateway with the shared agent budget', async () => {
  let turn = 0;
  let observed = null;
  const budget = new GlobalApiBudget({ maxRequests: 20, agentLimits: { blacksmith: 12 } });
  const gateway = {
    search: async input => { observed = input; input.budget.consume({ url: '/search', agentId: input.agentId }); return { markdown: '## Result' }; },
    fetch: async () => ({ markdown: 'page' }),
  };
  const agent = new AgentExecutionService({
    modelAdapter: { chat: async ({ messages }) => {
      turn += 1;
      if (turn === 1) return { toolCalls: [{ id: 'search-1', name: 'web_search', arguments: { query: 'open source OCR' } }] };
      const evidence = JSON.parse(messages.find(message => message.role === 'tool').content);
      return { toolCalls: [{ id: 'finish-1', name: 'finish_task', arguments: { summary: 'Research complete', evidenceIds: [evidence.id] } }] };
    } },
    runtime: { createWorkspace: async () => ({}), execute: async () => ({ exitCode: 0 }) },
    knowledgeGateway: gateway,
  });
  const result = await agent.runTask({ request: 'Research OCR', model: 'local', workspaceId: 'ws-blacksmith', agentId: 'blacksmith', allowedTools: ['web_search'], webBudget: budget });
  assert.equal(result.completed, true);
  assert.equal(observed.agentId, 'blacksmith');
  assert.equal(observed.budget, budget);
  assert.equal(budget.snapshot().agentUsage.blacksmith, 1);
});
