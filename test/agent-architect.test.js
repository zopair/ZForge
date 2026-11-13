import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentManifest, evaluateAgentActivation } from '../src/core/agent-architect.js';

const manifest=(overrides={})=>({
  id:'qa-agent',name:'QA Agent',version:'1.0.0',status:'TESTING',
  mission:'Run application tests',nonGoals:['Publish releases'],
  inputs:{task:'string'},outputs:{report:'object'},
  tools:[{id:'playwright',capability:'browser-testing',version:'1.0.0',licenseEvidence:'https://example.org/license'}],
  permissions:{allow:['test:run'],deny:['repository:merge-main','secrets:read'],approvalRequired:['repository:write-branch']},
  resourceLimits:{cpu:1,memoryMb:1024,storageMb:512,timeoutSeconds:600},
  tests:['representative','edge','adversarial','missing-dependency','quota-exhaustion'],
  rollback:'Deactivate agent and restore prior manifest',
  ...overrides
});
const passing={representative:'passed',edge:'passed',adversarial:'passed','missing-dependency':'passed','quota-exhaustion':'passed'};
test('agent manifest validates required identity permissions resources and tests',()=>{
  assert.equal(validateAgentManifest(manifest()).valid,true);
  assert.throws(()=>validateAgentManifest(manifest({permissions:{allow:['secrets:read'],deny:[],approvalRequired:[]}})),/privileged/i);
  assert.throws(()=>validateAgentManifest(manifest({resourceLimits:{cpu:0,memoryMb:0,storageMb:0,timeoutSeconds:0}})),/resource/i);
});
test('agent cannot activate with missing or failing required tests',()=>{
  const result=evaluateAgentActivation(manifest(),{testResults:{representative:'passed'},licenseVerified:true,securityReviewed:true,permissionsReviewed:true});
  assert.equal(result.eligibleForActivation,false);
  assert.equal(result.status,'BLOCKED');
});
test('agent with all gates and tests still requires independent activation approval',()=>{
  const result=evaluateAgentActivation(manifest(),{testResults:passing,licenseVerified:true,securityReviewed:true,permissionsReviewed:true});
  assert.equal(result.eligibleForActivation,true);
  assert.equal(result.status,'APPROVAL_REQUIRED');
  assert.equal(result.activated,false);
});
test('agent cannot activate when license or security review is unresolved',()=>{
  const result=evaluateAgentActivation(manifest(),{testResults:passing,licenseVerified:null,securityReviewed:true,permissionsReviewed:true});
  assert.equal(result.eligibleForActivation,false);
});
