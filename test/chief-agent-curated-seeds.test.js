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
