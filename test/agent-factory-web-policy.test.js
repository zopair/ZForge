import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentFactory } from '../src/core/agent-factory.js';

function activeRecord(permissions = { allow: [], deny: [], approvalRequired: [] }) {
  const manifest = {
    id: 'blacksmith',
    name: 'Blacksmith',
    version: '1.0.0',
    status: 'ACTIVE',
    tools: [],
    permissions,
    resourceLimits: { cpu: 1, memoryMb: 256, storageMb: 128, timeoutSeconds: 30 },
  };
  return { manifest, status: 'ACTIVE' };
}

test('Blacksmith receives only web operations explicitly granted by central policy', async () => {
  const factory = new AgentFactory({
    registry: new Map([['blacksmith', activeRecord()]]),
    webPolicy: { getAgentPolicy: () => ({ enabled: true, allowedOperations: ['search', 'fetch'] }) },
  });
  const profile = await factory.getExecutionProfile('blacksmith');
  assert.ok(profile.allowedTools.includes('web_search'));
  assert.ok(profile.allowedTools.includes('web_fetch'));
});

test('manifest deny and approval-required rules remain authoritative over web policy', async () => {
  const factory = new AgentFactory({
    registry: new Map([['blacksmith', activeRecord({ allow: [], deny: ['web:search'], approvalRequired: ['web:fetch'] })]]),
    webPolicy: { getAgentPolicy: () => ({ enabled: true, allowedOperations: ['search', 'fetch'] }) },
  });
  const profile = await factory.getExecutionProfile('blacksmith');
  assert.equal(profile.allowedTools.includes('web_search'), false);
  assert.equal(profile.allowedTools.includes('web_fetch'), false);
  assert.ok(profile.approvalRequiredTools.includes('web_fetch'));
});
