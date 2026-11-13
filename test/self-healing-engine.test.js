import test from 'node:test';
import assert from 'node:assert/strict';
import { SelfHealingEngineeringEngine, classifyEngineeringFailure } from '../src/core/self-healing-engine.js';

test('classifies dependency, version, network, resource and unknown failures', () => {
  assert.equal(classifyEngineeringFailure({ stderr: "Cannot find module 'vite'" }).category, 'MISSING_DEPENDENCY');
  assert.equal(classifyEngineeringFailure({ stderr: 'ERESOLVE unable to resolve dependency tree' }).category, 'VERSION_CONFLICT');
  assert.equal(classifyEngineeringFailure({ stderr: 'getaddrinfo ENOTFOUND registry.npmjs.org' }).category, 'NETWORK_OR_REGISTRY');
  assert.equal(classifyEngineeringFailure({ stderr: 'JavaScript heap out of memory' }).category, 'RESOURCE_EXHAUSTION');
  assert.equal(classifyEngineeringFailure({ stderr: 'unclassified failure' }).category, 'UNKNOWN');
});

test('investigation searches relevant open-source alternatives and returns verified candidates', async () => {
  let query = null;
  const engine = new SelfHealingEngineeringEngine({
    discoveryService: {
      discover: async input => {
        query = input;
        return {
          status: 'COMPLETE',
          complete: true,
          queryCatalogComplete: true,
          candidateEvaluationComplete: true,
          results: [{
            fullName: 'example/vite-adapter',
            capabilities: ['web-frontend'],
            evaluation: { eligible: true, status: 'CANDIDATE' },
          }],
        };
      },
    },
    memoryStore: { loadRelevant: async () => ({ lessons: ['Use pinned compatible versions'] }) },
  });

  const result = await engine.investigate({
    request: 'Build a web frontend with Vite',
    failure: { command: 'npm', args: ['run', 'build'], exitCode: 1, stderr: "Cannot find module 'vite'" },
  });

  assert.equal(result.status, 'ALTERNATIVES_FOUND');
  assert.equal(result.failure.category, 'MISSING_DEPENDENCY');
  assert.equal(result.alternatives[0].fullName, 'example/vite-adapter');
  assert.ok(query.capabilities.includes('web-frontend'));
  assert.ok(query.keywords.length > 0);
  assert.deepEqual(result.memoryLessons, ['Use pinned compatible versions']);
});

test('incomplete discovery requests another research pass and never proposes premature rebuilding', async () => {
  const engine = new SelfHealingEngineeringEngine({
    discoveryService: { discover: async () => ({ status: 'PAUSED_RATE_LIMIT', complete: false, queryCatalogComplete: false, results: [] }) },
  });
  const result = await engine.investigate({
    request: 'Build Android APK',
    failure: { stderr: 'Gradle dependency resolution failed' },
  });
  assert.equal(result.status, 'DISCOVERY_CONTINUATION_REQUIRED');
  assert.equal(result.internalToolBuild, null);
  assert.ok(result.nextActions.includes('CONTINUE_OPEN_SOURCE_DISCOVERY'));
});

test('complete discovery with fully evaluated candidates and no eligible tool proposes a minimal internal tool', async () => {
  const engine = new SelfHealingEngineeringEngine({
    discoveryService: {
      discover: async () => ({
        status: 'COMPLETE',
        complete: true,
        queryCatalogComplete: true,
        results: [],
      }),
    },
  });
  const result = await engine.investigate({
    request: 'Build offline Android packaging support',
    failure: { stderr: 'No compatible packaging tool found' },
  });
  assert.equal(result.status, 'INTERNAL_TOOL_BUILD_REQUIRED');
  assert.equal(result.internalToolBuild.zeroBudgetOnly, true);
  assert.equal(result.internalToolBuild.openSourceOnly, true);
  assert.ok(result.internalToolBuild.requiredWork.includes('unit-integration-and-regression-tests'));
});

test('repeated identical failures are identified without hiding the failure evidence', async () => {
  let searches = 0;
  const engine = new SelfHealingEngineeringEngine({
    discoveryService: { discover: async () => { searches += 1; return { status: 'BATCH_COMPLETE', complete: false, results: [] }; } },
  });
  const input = { request: 'Build a web app', failure: { stderr: 'Cannot find module react' } };
  const first = await engine.investigate(input);
  const second = await engine.investigate({ ...input, previousAttempts: [first] });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(second.duplicateFailure, true);
  assert.equal(searches, 1);
});


test('completed discovery exposes unverified repositories for inspection instead of treating metadata as proof', async () => {
  const engine = new SelfHealingEngineeringEngine({
    discoveryService: {
      discover: async () => ({
        status: 'COMPLETE',
        complete: true,
        queryCatalogComplete: true,
        results: [{
          fullName: 'example/candidate',
          htmlUrl: 'https://github.com/example/candidate',
          license: { spdxId: 'MIT' },
          archived: false,
          discoveryOnly: true,
        }],
      }),
    },
  });
  const result = await engine.investigate({
    request: 'Build a Vite web frontend',
    failure: { stderr: 'Cannot find module vite' },
  });
  assert.equal(result.status, 'CANDIDATES_REQUIRE_EVALUATION');
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.candidatesToEvaluate[0].fullName, 'example/candidate');
  assert.equal(result.candidatesToEvaluate[0].discoveryOnly, true);
  assert.ok(result.nextActions.includes('VERIFY_LICENSE_AND_NOTICES'));
});
