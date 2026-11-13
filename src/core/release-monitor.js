export { evaluateReleaseUpdate } from './discovery-engine.js';

export function buildMaintenanceReport(records, releaseSnapshots = []) {
  if (!Array.isArray(records) || !Array.isArray(releaseSnapshots)) throw new TypeError('records and releaseSnapshots must be arrays');
  const byId=new Map(releaseSnapshots.map(item=>[item.id,item]));
  return records.map(record=>{
    const latest=byId.get(record.id);
    if (!latest) return { id:record.id, status:'NO_RELEASE_DATA', action:'RETAIN_PIN', automatic:false };
    return {
      id:record.id, current:record.version, latest:latest.version,
      status:latest.securityAdvisory?'SECURITY_REVIEW':latest.version===record.version?'CURRENT':'UPDATE_AVAILABLE',
      action:latest.version===record.version?'NO_CHANGE':'REVIEW_REQUIRED',
      automatic:false,
      evidence:latest.source ?? null,
    };
  });
}
