import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTool, rankTools } from '../src/core/tool-evaluator.js';
const passingTool=(overrides={})=>({
  id:'tool-a',capability:'static-analysis',
  gates:{licenseCompatible:true,secure:true,runtimeCompatible:true,lawful:true,zeroCostViable:true},
  scores:{capabilityFit:5,correctness:4,evidenceQuality:4,integration:4,maintenance:3,costCompliance:5,resourceEfficiency:4},
  evidence:{pinnedVersion:true,officialSource:true,reproducibleTest:true,rawResults:true,verifiedAt:'2026-11-13'},
  popularity:{stars:1,downloads:1},...overrides
});
test('computes weighted score and ignores popularity signals',()=>{
  const low=evaluateTool(passingTool({popularity:{stars:0,downloads:0}}));
  const famous=evaluateTool(passingTool({popularity:{stars:900000,downloads:999999999}}));
  assert.equal(low.score,86);assert.equal(famous.score,low.score);assert.equal(low.status,'VERIFIED');assert.equal(low.confidence,'HIGH');
});
test('hard-gate failure rejects regardless of score',()=>{
  const result=evaluateTool(passingTool({gates:{licenseCompatible:false,secure:true,runtimeCompatible:true,lawful:true,zeroCostViable:true}}));
  assert.equal(result.status,'REJECTED');assert.equal(result.score,null);
});
test('unknown hard gates quarantine without score',()=>{
  const result=evaluateTool(passingTool({gates:{licenseCompatible:null,secure:true,runtimeCompatible:true,lawful:true,zeroCostViable:true}}));
  assert.equal(result.status,'CONDITIONAL');assert.equal(result.score,null);
});
test('rejects invalid score input',()=>{assert.throws(()=>evaluateTool(passingTool({scores:{capabilityFit:9}})),/score/i);});
test('ranks only same capability and orders by evidence-backed score',()=>{
  const a=passingTool({id:'a'});
  const b=passingTool({id:'b',scores:{capabilityFit:4,correctness:4,evidenceQuality:4,integration:4,maintenance:4,costCompliance:5,resourceEfficiency:4}});
  const other=passingTool({id:'other',capability:'android-build'});
  assert.deepEqual(rankTools([b,other,a],'static-analysis').map(item=>item.id),['a','b']);
});
test('excludes tools that fail any hard gate from rankings',()=>{
  const unsafe=passingTool({id:'unsafe',gates:{licenseCompatible:true,secure:false,runtimeCompatible:true,lawful:true,zeroCostViable:true}});
  assert.deepEqual(rankTools([unsafe,passingTool({id:'safe'})],'static-analysis').map(item=>item.id),['safe']);
});
