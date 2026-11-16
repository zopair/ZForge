import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiBudgetExceededError, GlobalApiBudget } from '../src/core/global-api-budget.js';

test('shared API budget rejects the next request before network access', () => {
  const budget = new GlobalApiBudget({ maxRequests: 2 });
  budget.consume({ url: '/rate_limit' });
  budget.consume({ url: '/search/repositories' });
  assert.throws(() => budget.consume({ url: '/repos/org/tool' }), ApiBudgetExceededError);
  assert.equal(budget.snapshot().used, 2);
  assert.equal(budget.snapshot().halted, true);
});

test('critical quota observation halts future work without spending more budget', () => {
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  budget.consume({ url: '/rate_limit' });
  assert.equal(budget.observeQuota({ remaining: 9, limit: 100 }, 'core'), true);
  assert.throws(() => budget.consume({ url: '/repos/org/tool' }), ApiBudgetExceededError);
  assert.equal(budget.snapshot().used, 1);
});

test('budget snapshot records request evidence but never authentication material', () => {
  const budget = new GlobalApiBudget({ maxRequests: 3 });
  budget.consume({ url: '/repos/org/tool' });
  const snapshot = JSON.stringify(budget.snapshot());
  assert.match(snapshot, /repos\/org\/tool/);
  assert.doesNotMatch(snapshot, /authorization|secret|bearer/i);
});
