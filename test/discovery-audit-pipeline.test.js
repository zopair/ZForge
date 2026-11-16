import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDiscoveredCandidates } from '../src/core/discovery-audit-pipeline.js';

test('candidate audit stops at the shared budget and logs an explicit reason for every candidate', async () => {
  let inspections = 0;
  const logs = [];
  let used = 0;
  const budget = { snapshot: () => ({ remainingBudget: Math.max(0, 2 - used) }) };
  const inspector = { inspectRepository: async fullName => {
    inspections += 1;
    used += 1;
    return {
      repository: { name: fullName.split('/')[1], htmlUrl: `https://github.com/${fullName}`, license: { spdxId: 'MIT' } },
      structuralEvidence: { readme: true, testsDirectory: true, apiDocumentation: false, configurationManifest: false },
      zeroCostAssessment: { status: 'STATIC_REVIEW_CLEAR' },
      inspectionComplete: true,
      evidence: { sourcePath: 'README.md', snippet: '# OCR tool', url: `https://github.com/${fullName}/blob/main/README.md` },
    };
  } };
  const result = await auditDiscoveredCandidates({
    candidates: [{ fullName: 'org/one', pushedAt: new Date().toISOString() }, { fullName: 'org/two', pushedAt: new Date().toISOString() }, { fullName: 'org/three' }],
    inspector, budget, logger: { info: message => logs.push(message) },
  });
  assert.equal(inspections, 2);
  assert.equal(result.processed, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.accepted.length, 2);
  assert.ok(logs.some(line => line.includes('org/three') && line.includes('Skipped: API budget exhausted')));
});

test('candidate audit quarantines incomplete evidence and rejects commercial credentials', async () => {
  const logs = [];
  const budget = { snapshot: () => ({ remainingBudget: 5 }) };
  const inspector = { inspectRepository: async name => ({
    repository: { name, htmlUrl: `https://github.com/org/${name}`, license: { spdxId: 'MIT' } },
    structuralEvidence: { readme: true, testsDirectory: true, apiDocumentation: false, configurationManifest: false },
    zeroCostAssessment: { status: 'REJECTED_PAID_REQUIREMENT' },
    inspectionComplete: false,
    evidence: { sourcePath: 'README.md', snippet: '# tool', url: 'https://github.com/org/tool/blob/main/README.md' },
  }) };
  const result = await auditDiscoveredCandidates({ candidates: [{ fullName: 'org/tool', pushedAt: new Date().toISOString() }], inspector, budget, logger: { info: line => logs.push(line) } });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /Commercial SaaS keys/);
  assert.match(result.rejected[0].reason, /Inspection incomplete/);
  assert.ok(logs.some(line => line.includes('Rejected: Commercial SaaS keys')));
});
