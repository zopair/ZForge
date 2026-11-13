import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('authenticated repository catalog exposes the combined curated and agent-master seeds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-repository-catalog-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'repository-catalog-test-token' });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const headers = { Authorization: 'Bearer repository-catalog-test-token' };
  try {
    const unauthorized = await fetch(`${base}/api/repositories/catalog`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${base}/api/repositories/catalog?limit=100`, { headers });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.total >= 180);
    assert.equal(payload.items.some(item => item.fullName === 'Significant-Gravitas/AutoGPT'), true);
    assert.equal(payload.items.some(item => item.fullName === 'torvalds/linux'), true);
    const agentSeed = payload.items.find(item => item.fullName === 'Significant-Gravitas/AutoGPT');
    assert.equal(agentSeed.projectType, 'FRAMEWORK');
    assert.equal(agentSeed.status, 'PENDING_REVIEW');
    assert.equal(agentSeed.installable, false);
    assert.equal(agentSeed.clonePolicy, 'ON_DEMAND');

    const filtered = await fetch(`${base}/api/repositories/catalog?category=medical-healthcare&limit=100`, { headers });
    const filteredPayload = await filtered.json();
    assert.ok(filteredPayload.items.length >= 6);
    assert.ok(filteredPayload.items.every(item => item.category === 'medical-healthcare'));
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('repository catalog validates pagination and category filters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-repository-catalog-validation-'));
  const gateway = createTaskGateway({ dataDir: root, token: 'repository-catalog-test-token' });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const headers = { Authorization: 'Bearer repository-catalog-test-token' };
  try {
    const invalidLimit = await fetch(`${base}/api/repositories/catalog?limit=1000`, { headers });
    assert.equal(invalidLimit.status, 400);
    const invalidOffset = await fetch(`${base}/api/repositories/catalog?offset=-1`, { headers });
    assert.equal(invalidOffset.status, 400);
    const invalidCategory = await fetch(`${base}/api/repositories/catalog?category=not-a-category`, { headers });
    assert.equal(invalidCategory.status, 400);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
