import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentWebPolicy } from '../src/core/agent-web-policy.js';

test('agent web policy enforces the approved task and Blacksmith quotas', () => {
  const policy = new AgentWebPolicy({
    version: 1,
    webAccess: { enabled: true, maxRequestsPerTask: 20, defaultAgentQuota: 0, agents: { blacksmith: { enabled: true, maxRequests: 12, allowedOperations: ['search', 'fetch'] } } },
  });
  const budget = policy.createTaskBudget();
  for (let index = 0; index < 12; index += 1) budget.consume({ agentId: 'blacksmith', url: '/search' });
  assert.throws(() => budget.consume({ agentId: 'blacksmith', url: '/search' }), /budget exhausted/);
  assert.equal(budget.snapshot().used, 12);
  assert.equal(budget.snapshot().remainingBudget, 8);
});

test('disabled and unallocated agents receive no web policy', () => {
  const policy = new AgentWebPolicy({
    version: 1,
    webAccess: { enabled: true, maxRequestsPerTask: 20, defaultAgentQuota: 0, agents: { blacksmith: { enabled: true, maxRequests: 12, allowedOperations: ['search'] } } },
  });
  assert.equal(policy.getAgentPolicy('observer'), null);
  assert.throws(() => policy.createTaskBudget().consume({ agentId: 'observer', url: '/search' }), /no web request allocation/);
});
