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
