import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourcePolicy } from '../scripts/agents/resource-manager.mjs';

test('resource policy enforces a hard request ceiling', async () => {
  const policy = createResourcePolicy({ maxRequests: 1, maxRetries: 0 });
  await policy.run(async () => ({ status: 200 }));
  await assert.rejects(() => policy.run(async () => ({ status: 200 })), /RESOURCE_BUDGET_EXHAUSTED/);
  assert.equal(policy.requests, 1);
  assert.equal(policy.remaining, 0);
});

test('resource policy retries transient status with bounded exponential delay', async () => {
  const delays = [];
  const policy = createResourcePolicy({ maxRequests: 1, maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 });
  let attempts = 0;
  const result = await policy.run(async () => ({ status: ++attempts < 3 ? 503 : 200 }), {
    sleep: async ms => delays.push(ms),
  });
  assert.equal(result.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('resource policy does not retry permanent HTTP errors', async () => {
  const policy = createResourcePolicy({ maxRequests: 1, maxRetries: 2 });
  let attempts = 0;
  const result = await policy.run(async () => ({ status: ++attempts === 1 ? 404 : 200 }));
  assert.equal(result.status, 404);
  assert.equal(attempts, 1);
});
