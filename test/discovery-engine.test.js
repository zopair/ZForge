import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiscoveryPlan, classifyLicense, createCandidateRecord, evaluateRepositoryCandidate,
  rankCandidates, composeToolchain, evaluateReleaseUpdate,
} from '../src/core/discovery-engine.js';

const repo = (overrides = {}) => ({
  id: 1, fullName: 'example/tool', name: 'tool', description: 'Example tool',
  htmlUrl: 'https://github.com/example/tool', archived: false,
  license: { spdxId: 'MIT', name: 'MIT License' },
  zeroCostVerified: true, selfHosted: true, paidDependency: false,
  runtimeCompatible: true, licenseCompatibilityVerified: true, licenseTextReviewed: true, securityBlocked: false,
  dependencyReviewComplete: true, securityReviewed: true, maintenanceReviewed: true, versionPinned: true,
  capabilities: ['web-frontend'], provides: ['frontend'], requires: [],
  conflicts: [], version: '1.2.0', popularity: { stars: 999999 },
  ...overrides,
});

test('discovery plan covers the requested engineering domains and major vendor ecosystems', () => {
  const plan = buildDiscoveryPlan({ capabilities: ['arabic-rtl', 'android-build'] });
  const ids = plan.domains.map(item => item.id);
  for (const id of ['cloud-computing','github-engineering','full-stack','web','android','ios-apple','ai-models','agents','graphics','arabic-localization','audio-voice','security','devops-qa','data-engineering','developer-tools','media-production']) {
    assert.ok(ids.includes(id), `missing domain: ${id}`);
  }
  const vendors = plan.vendorSeeds.map(item => item.id);
  for (const id of ['google','anthropic','microsoft','apple','meta','xai','github']) assert.ok(vendors.includes(id));
  const vendorOrgs=plan.vendorSeeds.flatMap(vendor=>vendor.orgs);
  assert.equal(new Set(vendorOrgs).size,vendorOrgs.length);
  assert.ok(plan.queries.some(query => query.includes('arabic-rtl')));
  assert.ok(plan.vendorQueries.some(query => query.includes('org:anthropics')));
  assert.ok(plan.vendorQueries.some(query => query.includes('org:google')));
  assert.ok(plan.queries.some(query => query.includes('topic:android')));
  assert.equal(plan.domains.find(domain=>domain.id==='android').requested,true);
  assert.equal(plan.domains.find(domain=>domain.id==='arabic-localization').requested,true);
  const completePlan=buildDiscoveryPlan({maxQueries:500});
  assert.equal(completePlan.queryCatalogComplete,true);
  assert.equal(completePlan.omittedQueries.length,0);
  assert.ok(completePlan.totalQueryCount>=completePlan.queries.length);
});

test('license classifier distinguishes approved open source, non-open source, and unknown', () => {
  assert.equal(classifyLicense('MIT').status, 'OPEN_SOURCE');
  assert.equal(classifyLicense('Apache-2.0').status, 'OPEN_SOURCE');
  assert.equal(classifyLicense('AGPL-3.0-only').status, 'OPEN_SOURCE');
  assert.equal(classifyLicense('BUSL-1.1').status, 'NOT_OPEN_SOURCE');
  assert.equal(classifyLicense('BSL-1.0').status, 'OPEN_SOURCE');
  assert.equal(classifyLicense('CC0-1.0').status, 'UNKNOWN');
  assert.equal(classifyLicense('CERN-OHL-P-2.0').status, 'UNKNOWN');
  assert.equal(classifyLicense('WTFPL').status, 'UNKNOWN');
  assert.equal(classifyLicense('OFL-1.1').status, 'UNKNOWN');
  assert.equal(classifyLicense('OFL-1.1',{artifactType:'font'}).status, 'OPEN_SOURCE');
  assert.equal(classifyLicense(null).status, 'UNKNOWN');
});

test('unknown license or cost is quarantined rather than accepted', () => {
  const unknown = evaluateRepositoryCandidate(repo({ license: null }));
  assert.equal(unknown.status, 'QUARANTINED');
  assert.equal(unknown.eligible, false);
  const unknownCost = evaluateRepositoryCandidate(repo({ zeroCostVerified: null }));
  assert.equal(unknownCost.status, 'QUARANTINED');
});

test('raw discovery metadata cannot become eligible without explicit evidence', () => {
  const candidate=createCandidateRecord({repository:{id:42,fullName:'org/discovered',license:{spdxId:'MIT'},archived:false},capabilities:['web-frontend']});
  assert.equal(candidate.evaluation.status,'QUARANTINED');
  assert.equal(candidate.evaluation.eligible,false);
});

test('non-open-source license, paid dependency, or archived project is rejected', () => {
  assert.equal(evaluateRepositoryCandidate(repo({ license: { spdxId: 'BUSL-1.1' } })).status, 'REJECTED');
  assert.equal(evaluateRepositoryCandidate(repo({ paidDependency: true })).status, 'REJECTED');
  assert.equal(evaluateRepositoryCandidate(repo({ archived: true })).status, 'REJECTED');
});

test('popularity never affects candidate ranking', () => {
  const modest = repo({ id: 1, fullName: 'a/modest', popularity: { stars: 1 } });
  const famous = repo({ id: 2, fullName: 'b/famous', popularity: { stars: 10000000 } });
  const rankedA = rankCandidates([modest, famous], 'web-frontend').map(item => item.fullName);
  const rankedB = rankCandidates([famous, modest], 'web-frontend').map(item => item.fullName);
  assert.deepEqual(rankedA, rankedB);
});

test('toolchain composition rejects incompatible capability conflicts and unresolved licenses', () => {
  const frontend = repo({ fullName: 'a/frontend', provides: ['frontend'], requires: ['api'], conflicts: [] });
  const backend = repo({ fullName: 'b/backend', provides: ['api'], requires: [], conflicts: ['frontend'] });
  const result = composeToolchain([frontend, backend]);
  assert.equal(result.compatible, false);
  assert.ok(result.conflicts.length > 0);
  const unknown = repo({ fullName: 'c/unknown', license: null });
  assert.equal(composeToolchain([unknown]).compatible, false);
});

test('toolchain composition accepts a complete compatible open-source stack', () => {
  const frontend = repo({ fullName: 'a/frontend', provides: ['frontend'], requires: ['api'] });
  const backend = repo({ fullName: 'b/backend', provides: ['api','database'], requires: [] });
  const result = composeToolchain([frontend, backend]);
  assert.equal(result.compatible, true);
  assert.deepEqual(result.unresolvedRequirements, []);
});

test('toolchain composition detects incompatible package pins', () => {
  const first = repo({ fullName:'a/one', packagePins:{ react:'18.2.0' } });
  const second = repo({ fullName:'b/two', packagePins:{ react:'19.0.0' } });
  const result = composeToolchain([first,second]);
  assert.equal(result.compatible,false);
  assert.ok(result.conflicts.some(item=>item.conflict==='PACKAGE_VERSION_CONFLICT:react'));
});

test('release monitor recommends review and never silently approves automatic upgrades', () => {
  const patch = evaluateReleaseUpdate({ current: '1.2.0', latest: '1.2.1', pinned: true });
  assert.equal(patch.action, 'REVIEW_REQUIRED');
  assert.equal(patch.automatic, false);
  const major = evaluateReleaseUpdate({ current: '1.2.0', latest: '2.0.0', pinned: true });
  assert.equal(major.risk, 'MAJOR');
  assert.equal(evaluateReleaseUpdate({ current: '1.2.0', latest: '1.2.0', pinned: true }).action, 'NO_CHANGE');
});
