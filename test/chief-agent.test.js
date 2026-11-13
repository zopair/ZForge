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

test('Chief Agent extracts a bounded DAG only for independently active specialists', async () => {
  const agent = new ChiefAgent({
    modelAdapter: {
      chat: async () => ({
        content: 'Draft the implementation in parallel.\n<ORCHESTRATION_PLAN>\n' + JSON.stringify({
          tasks: [
            { id: 'research', agentId: 'researcher', request: 'Research compatible open-source libraries', dependsOn: [] },
            { id: 'build', agentId: 'builder', request: 'Build the integration', dependsOn: ['research'] },
          ],
        }) + '\n</ORCHESTRATION_PLAN>',
      }),
    },
    discoveryService: { discover: async () => ({ status: 'COMPLETE', results: [] }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  const result = await agent.planTask({
    request: 'Build and verify a local web integration',
    availableAgents: [
      { id: 'researcher', name: 'Researcher', status: 'ACTIVE', mission: 'Research' },
      { id: 'builder', name: 'Builder', status: 'ACTIVE', mission: 'Build' },
      { id: 'draft-agent', name: 'Draft Agent', status: 'PROPOSED', mission: 'Not executable' },
    ],
  });
  assert.equal(result.orchestrationTasks.length, 2);
  assert.deepEqual(result.orchestrationTasks[1].dependsOn, ['research']);
  assert.deepEqual(result.availableAgents.map(agent => agent.id), ['researcher', 'builder']);
  assert.equal(result.orchestrationStatus, 'PROPOSED');
});

test('Chief Agent rejects orchestration plans that invent agents or contain cycles', async () => {
  let response = '<ORCHESTRATION_PLAN>' + JSON.stringify({
    tasks: [{ id: 'research', agentId: 'invented-agent', request: 'Do work', dependsOn: [] }],
  }) + '</ORCHESTRATION_PLAN>';
  const agent = new ChiefAgent({
    modelAdapter: { chat: async () => ({ content: response }) },
    discoveryService: { discover: async () => ({ status: 'COMPLETE', results: [] }) },
    memoryStore: { loadRelevant: async () => ({}) },
    promptProvider: { getChiefAgentPrompt: async () => 'Canonical instructions' },
    model: 'local-model',
  });
  const invalidAgent = await agent.planTask({
    request: 'Build something',
    availableAgents: [{ id: 'builder', status: 'ACTIVE' }],
  });
  assert.equal(invalidAgent.orchestrationTasks, null);
  assert.match(invalidAgent.orchestrationPlanError, /active agent/i);

  response = '<ORCHESTRATION_PLAN>' + JSON.stringify({
    tasks: [
      { id: 'one', agentId: 'builder', request: 'One', dependsOn: ['two'] },
      { id: 'two', agentId: 'builder', request: 'Two', dependsOn: ['one'] },
    ],
  }) + '</ORCHESTRATION_PLAN>';
  const cycle = await agent.planTask({
    request: 'Build something',
    availableAgents: [{ id: 'builder', status: 'ACTIVE' }],
  });
  assert.equal(cycle.orchestrationTasks, null);
  assert.match(cycle.orchestrationPlanError, /cycle/i);
});
