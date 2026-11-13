import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('authenticated web verification endpoint runs requested browsers and stores evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-web-verify-api-'));
  const calls = [];
  const webBrowserVerificationService = {
    verify: async input => {
      calls.push(input);
      return {
        status: 'passed',
        summary: { total: 2, passed: 2, failed: 0 },
        browsers: [
          { name: 'chromium', status: 'passed', httpStatus: 200, title: 'App' },
          { name: 'firefox', status: 'passed', httpStatus: 200, title: 'App' },
        ],
      };
    },
  };
  const gateway = createTaskGateway({
    dataDir: root,
    token: 'browser-verification-token',
    webBrowserVerificationService,
  });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer browser-verification-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'verify built web application' }) });
    const task = await created.json();
    const denied = await fetch(base + '/api/tasks/' + task.id + '/web-verify', {
      method: 'POST', headers, body: JSON.stringify({ projectPath: 'frontend' }),
    });
    assert.equal(denied.status, 409);
    const run = await fetch(base + '/api/tasks/' + task.id + '/web-verify', {
      method: 'POST', headers, body: JSON.stringify({
        confirmExecution: true,
        projectPath: 'frontend',
        outputDirectory: 'build',
        browsers: ['chromium', 'firefox'],
        viewportWidth: 1280,
        viewportHeight: 800,
      }),
    });
    assert.equal(run.status, 200);
    const completed = await run.json();
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.result.summary.passed, 2);
    assert.deepEqual(calls[0], {
      workspaceId: task.workspaceId,
      projectPath: 'frontend',
      outputDirectory: 'build',
      browsers: ['chromium', 'firefox'],
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    const eventsResponse = await fetch(base + '/api/tasks/' + task.id + '/events?after=1', { headers });
    const events = await eventsResponse.json();
    assert.ok(events.events.some(event => event.type === 'task.running'));
    assert.ok(events.events.some(event => event.type === 'task.succeeded'));
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('web verification reports missing Playwright as inconclusive instead of a false pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-web-verify-unavailable-'));
  const gateway = createTaskGateway({
    dataDir: root,
    token: 'browser-verification-token',
    webBrowserVerificationService: {
      verify: async () => ({ status: 'unavailable', reason: 'Playwright is not installed.', summary: { total: 3, passed: 0, failed: 0 }, browsers: [] }),
    },
  });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer browser-verification-token', 'Content-Type': 'application/json' };
  try {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ request: 'verify web project' }) });
    const task = await created.json();
    const run = await fetch(base + '/api/tasks/' + task.id + '/web-verify', {
      method: 'POST', headers, body: JSON.stringify({ confirmExecution: true }),
    });
    const completed = await run.json();
    assert.equal(completed.status, 'inconclusive');
    assert.equal(completed.result.status, 'unavailable');
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
