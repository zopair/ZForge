import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_REPOSITORY_SEEDS, UNRESOLVED_REPOSITORY_REFERENCES } from '../src/core/curated-repository-catalog.js';
import { buildDiscoveryPlan } from '../src/core/discovery-engine.js';

test('curated repository catalog preserves unique canonical repository identities and review-pending state', () => {
  assert.ok(CURATED_REPOSITORY_SEEDS.length >= 120);
  const names = CURATED_REPOSITORY_SEEDS.map(item => item.fullName.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const item of CURATED_REPOSITORY_SEEDS) {
    assert.match(item.fullName, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    assert.ok(item.category);
    assert.equal(item.status, 'PENDING_REVIEW');
    assert.equal(item.installable, false);
  }
});

test('ambiguous user-supplied repository labels are preserved for resolution rather than guessed', () => {
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('rea'));
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('Matt Pocock / Skills for Real Engineers'));
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('Affaan / ECC'));
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('claude-mem'));
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('Addy Osmani / agent-skills'));
  assert.ok(UNRESOLVED_REPOSITORY_REFERENCES.includes('gemini-cli'));
});

test('discovery plan includes exact-owner curated repository queries in resumable catalogue', () => {
  const plan = buildDiscoveryPlan({ maxQueries: 500 });
  assert.equal(plan.curatedRepositorySeeds.length, CURATED_REPOSITORY_SEEDS.length);
  assert.ok(plan.curatedRepositoryQueries.some(query => query.includes('user:torvalds')));
  assert.ok(plan.curatedRepositoryQueries.some(query => query.includes('user:Wan-Video')));
  assert.equal(plan.queryCatalogComplete, true);
  assert.ok(plan.queries.length >= CURATED_REPOSITORY_SEEDS.length);
});
