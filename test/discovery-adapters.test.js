import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryAdapters } from '../src/adapters/discovery-adapters.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

test('discovery and repository inspection are wired to the same API client and budget', () => {
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  const apiClient = { budget, request: async () => ({ data: {}, headers: {} }) };
  const adapters = createDiscoveryAdapters({ budget, apiClient });
  assert.equal(adapters.discovery.apiClient, apiClient);
  assert.equal(adapters.inspector.apiClient, apiClient);
  assert.equal(adapters.budget, budget);
});

test('factory creates one shared API client when no client is injected', () => {
  const adapters = createDiscoveryAdapters({ budget: new GlobalApiBudget({ maxRequests: 5 }) });
  assert.equal(adapters.discovery.apiClient, adapters.inspector.apiClient);
  assert.equal(adapters.apiClient, adapters.discovery.apiClient);
});
