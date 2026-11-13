import test from 'node:test';
import assert from 'node:assert/strict';
import { ChiefAgent } from '../src/core/chief-agent.js';

test('Chief Agent loads memory and discovery before requesting a local model plan',async()=>{
  const events=[];
  const agent=new ChiefAgent({
    modelAdapter:{chat:async({messages})=>{events.push('model');assert.match(messages[0].content,/untrusted/i);return{content:'Draft engineering plan'};}},
    discoveryService:{discover:async()=>{events.push('discovery');return{status:'BATCH_COMPLETE',results:[]};}},
    memoryStore:{loadRelevant:async()=>{events.push('memory');return{lessons:['Do not trust stars']};}},
    promptProvider:{getChiefAgentPrompt:async()=> 'Canonical Chief Agent instructions'},
    model:'qwen3:8b'
  });
  const result=await agent.planTask({request:'Build a small Android application',capabilities:['android'],keywords:['Kotlin']});
  assert.deepEqual(events,['memory','discovery','model']);
  assert.equal(result.status,'DRAFT_PLAN');
  assert.equal(result.requiresApproval,true);
  assert.equal(result.executionStarted,false);
  assert.equal(result.plan,'Draft engineering plan');
});
test('Chief Agent refuses to plan without a task request',async()=>{
  const agent=new ChiefAgent({modelAdapter:{chat:async()=>({content:'x'})},discoveryService:{discover:async()=>({})},memoryStore:{loadRelevant:async()=>({})},promptProvider:{getChiefAgentPrompt:async()=>''},model:'local-model'});
  await assert.rejects(()=>agent.planTask({request:' '}),/request/i);
});

test('Chief Agent includes a proposed zero-cost internal build brief when complete discovery finds no eligible tool', async () => {
  let submittedPrompt = '';
  const agent = new ChiefAgent({
    modelAdapter: { chat: async ({ messages }) => { submittedPrompt = messages[1].content; return { content: 'Build the missing tool in an isolated task branch.' }; } },
    discoveryService: { discover: async () => ({ status: 'COMPLETE', complete: true, results: [] }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  const result = await agent.planTask({ request: 'Build offline Arabic OCR', capabilities: ['offline-arabic-ocr'] });
  const context = JSON.parse(submittedPrompt.split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)));
  assert.equal(context.capabilityGapDecisions[0].action, 'BUILD_INTERNAL_TOOL');
  assert.equal(context.toolBuildBriefs[0].zeroBudgetOnly, true);
  assert.equal(context.toolBuildBriefs[0].openSourceOnly, true);
  assert.equal(result.executionStarted, false);
  assert.equal(result.requiresApproval, true);
});

test('Chief Agent does not create a build brief while discovery is incomplete', async () => {
  let submittedPrompt = '';
  const agent = new ChiefAgent({
    modelAdapter: { chat: async ({ messages }) => { submittedPrompt = messages[1].content; return { content: 'Continue bounded discovery.' }; } },
    discoveryService: { discover: async () => ({ status: 'RATE_LIMITED', queryCatalogComplete: false, results: [] }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  await agent.planTask({ request: 'Find offline OCR', capabilities: ['offline-arabic-ocr'] });
  const context = JSON.parse(submittedPrompt.split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)));
  assert.equal(context.capabilityGapDecisions[0].action, 'CONTINUE_DISCOVERY');
  assert.equal(context.toolBuildBriefs.length, 0);
});

test('Chief Agent plans with experimental workspaces and preserves failed experiments as learning', async () => {
  let submittedPrompt = '';
  const agent = new ChiefAgent({
    modelAdapter: { chat: async ({ messages }) => { submittedPrompt = messages[1].content; return { content: 'Use parallel experiments and retain failed findings.' }; } },
    discoveryService: { discover: async () => ({ status: 'COMPLETE', results: [] }) },
    memoryStore: { loadRelevant: async () => ({ previousFailures: ['Variant B failed on Arabic shaping'] }) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  await agent.planTask({ request: 'Compare two Arabic rendering engines', capabilities: ['arabic-rendering'] });
  const context = JSON.parse(submittedPrompt.split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)));
  assert.equal(context.workspaceOperatingPrinciples.defaultMode, 'experimental');
  assert.equal(context.workspaceOperatingPrinciples.failedExperimentsAreKnowledge, true);
  assert.equal(context.workspaceOperatingPrinciples.guardrailStrategy, 'contextual-not-blanket-deny');
  assert.ok(context.workspaceOperatingPrinciples.defaultCapabilities.includes('terminal'));
  assert.match(submittedPrompt, /parallel experiments/i);
});
