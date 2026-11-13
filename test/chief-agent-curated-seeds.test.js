import test from 'node:test';
import assert from 'node:assert/strict';
import { ChiefAgent } from '../src/core/chief-agent.js';

test('Chief Agent passes curated repository seeds to the planning model as unverified references', async () => {
  let submittedPrompt = '';
  const agent = new ChiefAgent({
    modelAdapter: { chat: async ({ messages }) => { submittedPrompt = messages[1].content; return { content: 'Review the curated seed before adoption.' }; } },
    discoveryService: { discover: async () => ({
      status: 'BATCH_COMPLETE',
      results: [],
      plan: {
        curatedRepositorySeeds: [{ fullName: 'torvalds/linux', category: 'core-platforms-languages', status: 'PENDING_REVIEW', installable: false }],
        unresolvedRepositoryReferences: ['claude-mem'],
      },
    }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  await agent.planTask({ request: 'Prepare a Linux build toolchain', capabilities: ['linux-build'] });
  const context = JSON.parse(submittedPrompt.split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)));
  assert.equal(context.curatedRepositorySeeds[0].fullName, 'torvalds/linux');
  assert.equal(context.curatedRepositorySeeds[0].installable, false);
  assert.deepEqual(context.unresolvedRepositoryReferences, ['claude-mem']);
});


test('Chief Agent receives the imported specialist agent library as unverified on-demand discovery leads', async () => {
  let submittedPrompt = '';
  const seeds = Array.from({ length: 64 }, (_, index) => ({
    fullName: index === 0 ? 'Significant-Gravitas/AutoGPT' : `agent-owner/agent-${index}`,
    category: index === 0 ? 'agent-frameworks' : 'coding-agents',
    projectType: index === 0 ? 'FRAMEWORK' : 'CODING_AGENT',
    status: 'PENDING_REVIEW',
    installable: false,
    clonePolicy: 'ON_DEMAND',
  }));
  const agent = new ChiefAgent({
    modelAdapter: { chat: async ({ messages }) => { submittedPrompt = messages[1].content; return { content: 'Compare candidates before use.' }; } },
    discoveryService: { discover: async () => ({
      status: 'BATCH_COMPLETE',
      results: [],
      plan: {
        curatedRepositorySeeds: [],
        agentMasterLibrarySeeds: seeds,
        allRepositorySeeds: seeds,
        unresolvedRepositoryReferences: [],
      },
    }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  await agent.planTask({ request: 'Find an agent framework', capabilities: ['agent-orchestration'] });
  const context = JSON.parse(submittedPrompt.split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)));
  assert.equal(context.agentMasterLibrarySeeds.length, 64);
  assert.equal(context.agentMasterLibrarySeeds[0].projectType, 'FRAMEWORK');
  assert.equal(context.agentMasterLibrarySeeds[0].installable, false);
  assert.equal(context.agentMasterLibrarySeeds[0].clonePolicy, 'ON_DEMAND');
  assert.equal(context.repositorySeedCatalog.length, 64);
});
