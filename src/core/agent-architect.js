const PRIVILEGED_ACTIONS=new Set(['repository:merge-main','repository:delete','release:publish','app:sign','secrets:read','permissions:write','policy:modify','external:publish']);
const LIFECYCLE=new Set(['PROPOSED','SPECIFIED','TESTING','ACTIVE','REVIEW','DEPRECATED','RETIRED']);
const REQUIRED_TESTS=['representative','edge','adversarial','missing-dependency','quota-exhaustion'];
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export function validateAgentManifest(manifest){
  if(!object(manifest))throw new TypeError('agent manifest must be an object');
  const required=['id','name','version','status','mission','nonGoals','inputs','outputs','tools','permissions','resourceLimits','tests','rollback'];
  for(const key of required)if(manifest[key]===undefined||manifest[key]===null)throw new TypeError(`agent manifest requires ${key}`);
  if(typeof manifest.id!=='string'||!manifest.id.trim()||typeof manifest.name!=='string'||!manifest.name.trim())throw new TypeError('agent id and name are required');
  if(!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new TypeError('agent version must use semantic versioning');
  if(!LIFECYCLE.has(manifest.status))throw new TypeError('invalid agent lifecycle status');
  if(typeof manifest.mission!=='string'||!manifest.mission.trim()||typeof manifest.rollback!=='string'||!manifest.rollback.trim())throw new TypeError('agent mission and rollback are required');
  if(!Array.isArray(manifest.nonGoals)||!object(manifest.inputs)||!object(manifest.outputs)||!Array.isArray(manifest.tools)||!Array.isArray(manifest.tests)||manifest.tests.length===0)throw new TypeError('agent inputs, outputs, tools, nonGoals and tests have invalid shapes');
  if(!object(manifest.permissions)||!Array.isArray(manifest.permissions.allow)||!Array.isArray(manifest.permissions.deny)||!Array.isArray(manifest.permissions.approvalRequired))throw new TypeError('agent permissions require allow, deny and approvalRequired arrays');
  const unsafe=manifest.permissions.allow.filter(action=>PRIVILEGED_ACTIONS.has(action));
  if(unsafe.length)throw new TypeError(`privileged actions cannot be directly allowed: ${unsafe.join(', ')}`);
  if(!object(manifest.resourceLimits))throw new TypeError('resource limits are required');
  for(const key of ['cpu','memoryMb','storageMb','timeoutSeconds'])if(!Number.isFinite(manifest.resourceLimits[key])||manifest.resourceLimits[key]<=0)throw new RangeError(`resource limit ${key} must be positive`);
  return {valid:true,agentId:manifest.id,version:manifest.version,privilegedActionsDeniedByDefault:[...PRIVILEGED_ACTIONS]};
}
export function evaluateAgentActivation(manifest,{testResults={},licenseVerified=null,securityReviewed=null,permissionsReviewed=null}={}){
  validateAgentManifest(manifest);
  const blockers=[];
  if(manifest.status!=='TESTING')blockers.push('AGENT_NOT_IN_TESTING_STATE');
  for(const testName of REQUIRED_TESTS)if(testResults[testName]!=='passed')blockers.push(`TEST_NOT_PASSED:${testName}`);
  if(licenseVerified!==true)blockers.push('LICENSE_NOT_VERIFIED');
  if(securityReviewed!==true)blockers.push('SECURITY_NOT_REVIEWED');
  if(permissionsReviewed!==true)blockers.push('PERMISSIONS_NOT_REVIEWED');
  return {
    eligibleForActivation:blockers.length===0,
    status:blockers.length?'BLOCKED':'APPROVAL_REQUIRED',
    activated:false,
    blockers,
    requiredIndependentApproval:blockers.length===0,
    note:'Agent Architect cannot activate an agent or approve its own permissions. Activation remains a separate approval action.',
  };
}
