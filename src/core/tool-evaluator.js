const WEIGHTS = Object.freeze({
  capabilityFit: 30, correctness: 20, evidenceQuality: 15,
  integration: 10, maintenance: 10, costCompliance: 10, resourceEfficiency: 5,
});
const GATE_KEYS = Object.freeze(['licenseCompatible','secure','runtimeCompatible','lawful','zeroCostViable']);
const EVIDENCE_KEYS = Object.freeze(['pinnedVersion','officialSource','reproducibleTest','rawResults']);

function assertObject(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`);}
function validateTool(tool){
  assertObject(tool,'tool');
  if(typeof tool.id!=='string'||!tool.id.trim())throw new TypeError('tool.id is required');
  if(typeof tool.capability!=='string'||!tool.capability.trim())throw new TypeError('tool.capability is required');
  assertObject(tool.gates,'tool.gates');assertObject(tool.scores,'tool.scores');assertObject(tool.evidence,'tool.evidence');
  for(const key of GATE_KEYS)if(![true,false,null].includes(tool.gates[key]))throw new TypeError(`gate ${key} must be true, false, or null`);
  for(const key of Object.keys(WEIGHTS)){const score=tool.scores[key];if(!Number.isFinite(score)||score<0||score>5)throw new RangeError(`score ${key} must be a number from 0 to 5`);}
}
function getConfidence(evidence){
  const count=EVIDENCE_KEYS.filter(key=>evidence[key]===true).length;
  if(count===EVIDENCE_KEYS.length&&typeof evidence.verifiedAt==='string'&&evidence.verifiedAt)return 'HIGH';
  if(count>=2)return 'MEDIUM';return 'LOW';
}
export function evaluateTool(tool){
  validateTool(tool);
  const failedGates=GATE_KEYS.filter(key=>tool.gates[key]===false);
  const unresolvedGates=GATE_KEYS.filter(key=>tool.gates[key]===null);
  const confidence=getConfidence(tool.evidence);
  if(failedGates.length)return{id:tool.id,capability:tool.capability,status:'REJECTED',score:null,confidence,failedGates,unresolvedGates};
  if(unresolvedGates.length)return{id:tool.id,capability:tool.capability,status:'CONDITIONAL',score:null,confidence,failedGates,unresolvedGates};
  const weighted=Object.entries(WEIGHTS).reduce((total,[key,weight])=>total+(tool.scores[key]/5)*weight,0);
  const score=Math.round(weighted*100)/100;
  const verified=EVIDENCE_KEYS.every(key=>tool.evidence[key]===true)&&typeof tool.evidence.verifiedAt==='string'&&tool.evidence.verifiedAt.length>0;
  return{id:tool.id,capability:tool.capability,status:verified?'VERIFIED':'CONDITIONAL',score,confidence,failedGates,unresolvedGates};
}
export function rankTools(tools,capability){
  if(!Array.isArray(tools))throw new TypeError('tools must be an array');
  if(typeof capability!=='string'||!capability.trim())throw new TypeError('capability is required');
  const statusOrder={VERIFIED:0,CONDITIONAL:1,REJECTED:2},confidenceOrder={HIGH:0,MEDIUM:1,LOW:2};
  return tools.filter(tool=>tool.capability===capability)
    .map(tool=>({...tool,evaluation:evaluateTool(tool)}))
    .filter(tool=>tool.evaluation.status!=='REJECTED')
    .sort((a,b)=>{
      const statusDelta=statusOrder[a.evaluation.status]-statusOrder[b.evaluation.status];if(statusDelta)return statusDelta;
      const scoreDelta=(b.evaluation.score??-1)-(a.evaluation.score??-1);if(scoreDelta)return scoreDelta;
      return confidenceOrder[a.evaluation.confidence]-confidenceOrder[b.evaluation.confidence];
    });
}
export const TOOL_SCORE_WEIGHTS=WEIGHTS;
