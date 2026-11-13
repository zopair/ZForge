import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCapabilityGap, createToolBuildBrief, evaluateRepositoryReuse } from '../src/core/self-extension-engine.js';

test('a complete discovery with no eligible tool creates an internal build requirement', () => {
  const gap = assessCapabilityGap({
    capability: 'offline-arabic-ocr',
    discovery: { status: 'COMPLETE', queryCatalogComplete: true, results: [] },
  });
  assert.equal(gap.action, 'BUILD_INTERNAL_TOOL');
  assert.equal(gap.reason, 'NO_ELIGIBLE_TOOL_FOUND_AFTER_COMPLETE_DISCOVERY');
  assert.equal(gap.requiresApproval, true);
});

test('incomplete discovery never triggers premature tool rebuilding', () => {
  const gap = assessCapabilityGap({
    capability: 'offline-arabic-ocr',
    discovery: { status: 'RATE_LIMITED', queryCatalogComplete: false, results: [] },
  });
  assert.equal(gap.action, 'CONTINUE_DISCOVERY');
  assert.equal(gap.requiresApproval, false);
});

test('a verified eligible tool is reused instead of rebuilt', () => {
  const gap = assessCapabilityGap({
    capability: 'web-frontend',
    discovery: { status: 'COMPLETE', queryCatalogComplete: true, results: [{ fullName: 'org/tool', capabilities: ['web-frontend'], evaluation: { eligible: true, status: 'CANDIDATE' } }] },
  });
  assert.equal(gap.action, 'REUSE_VERIFIED_TOOL');
  assert.equal(gap.selectedTool, 'org/tool');
});

test('tool build brief requires acceptance tests, zero-cost constraints and provenance', () => {
  const brief = createToolBuildBrief({
    capability: 'offline-arabic-ocr',
    task: 'Build an offline Arabic OCR engine',
    constraints: { maxMemoryMb: 2048 },
  });
  assert.equal(brief.status, 'PROPOSED');
  assert.equal(brief.zeroBudgetOnly, true);
  assert.equal(brief.openSourceOnly, true);
  assert.ok(brief.requiredWork.includes('license-and-dependency-audit'));
  assert.ok(brief.acceptanceTests.includes('adversarial-inputs'));
  assert.equal(brief.requiresIndependentReview, true);
});

test('repository reuse rejects license-incompatible copying and requires provenance for forks', () => {
  const denied = evaluateRepositoryReuse({
    mode: 'MODIFIED_CLONE',
    licenseVerified: true,
    licenseCompatible: false,
    noticesPreserved: true,
    sourceProvenanceRecorded: true,
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.blockers.includes('LICENSE_INCOMPATIBLE'));

  const fork = evaluateRepositoryReuse({
    mode: 'FORK_AND_MODIFY',
    licenseVerified: true,
    licenseCompatible: true,
    noticesPreserved: true,
    sourceProvenanceRecorded: true,
    securityReviewed: true,
  });
  assert.equal(fork.allowed, true);
  assert.equal(fork.requiresComplianceReview, true);
});

test('reverse engineering is limited to lawful interoperability and clean-room analysis', () => {
  const denied = evaluateRepositoryReuse({
    mode: 'REVERSE_ENGINEER',
    lawfulPurpose: false,
    bypassesAccessControls: true,
    handlesSecretsOrPrivateData: true,
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.blockers.includes('UNLAWFUL_OR_UNAUTHORIZED_PURPOSE'));
  assert.ok(denied.blockers.includes('ACCESS_CONTROL_BYPASS'));
  assert.ok(denied.blockers.includes('PRIVATE_DATA_OR_SECRET_EXPOSURE'));
});
