import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_MASTER_LIBRARY_SEEDS,
  AGENT_MASTER_LIBRARY_CATEGORIES,
} from '../src/core/agent-master-library-catalog.js';
import { buildDiscoveryPlan } from '../src/core/discovery-engine.js';

test('imports all 64 supplied agent-library repositories as non-installable review candidates', () => {
  assert.equal(AGENT_MASTER_LIBRARY_SEEDS.length, 64);
  const identities = AGENT_MASTER_LIBRARY_SEEDS.map(item => item.fullName.toLowerCase());
  assert.equal(new Set(identities).size, 64);
  for (const item of AGENT_MASTER_LIBRARY_SEEDS) {
    assert.match(item.fullName, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    assert.ok(AGENT_MASTER_LIBRARY_CATEGORIES.includes(item.category));
    assert.ok(['FRAMEWORK', 'CODING_AGENT', 'COMPUTER_USE_AGENT', 'DOMAIN_AGENT', 'MEMORY_RAG', 'SKILL_LIBRARY', 'PROTOCOL', 'BENCHMARK'].includes(item.projectType));
    assert.equal(item.status, 'PENDING_REVIEW');
    assert.equal(item.installable, false);
    assert.equal(item.source, 'USER_SUPPLIED_AGENT_MASTER_LIBRARY');
    assert.equal(item.clonePolicy, 'ON_DEMAND');
  }
});

test('agent library import retains specialist taxonomy and distinguishes executable candidates from references', () => {
  const byName = Object.fromEntries(AGENT_MASTER_LIBRARY_SEEDS.map(item => [item.fullName, item]));
  assert.equal(byName['OpenBB-finance/OpenBB'].category, 'finance-cyber');
  assert.equal(byName['modelcontextprotocol/servers'].projectType, 'PROTOCOL');
  assert.equal(byName['ethz-spylab/agentdojo'].projectType, 'BENCHMARK');
  assert.equal(byName['primeradiant/superpowers'].projectType, 'SKILL_LIBRARY');
  assert.equal(byName['rbr7/ClinClaw'].category, 'medical-healthcare');
  assert.equal(byName['OpenHands/OpenHands'].projectType, 'CODING_AGENT');
});

test('discovery plan includes agent library identities and exact-owner queries without bypassing query budgets', () => {
  const plan = buildDiscoveryPlan({ maxQueries: 500 });
  assert.equal(plan.agentMasterLibrarySeeds.length, 64);
  assert.ok(plan.curatedRepositorySeeds.length >= 120);
  assert.ok(plan.allRepositorySeeds.some(item => item.fullName === 'Significant-Gravitas/AutoGPT'));
  assert.ok(plan.allRepositorySeeds.some(item => item.fullName === 'modelcontextprotocol/modelcontextprotocol'));
  assert.ok(plan.agentMasterLibraryQueries.some(query => query.includes('user:OpenHands')));
  assert.ok(plan.queries.length <= 500);
  assert.equal(plan.queryCatalogComplete, plan.totalQueryCount <= 500);
});

test('overlapping curated identities are deduplicated in the combined discovery seed catalogue', () => {
  const plan = buildDiscoveryPlan({ maxQueries: 500 });
  const names = plan.allRepositorySeeds.map(item => item.fullName.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
