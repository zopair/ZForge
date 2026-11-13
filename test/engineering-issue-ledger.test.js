import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineeringIssueLedger } from '../src/adapters/engineering-issue-ledger.js';

const issue = overrides => ({
  title: 'Browser smoke test fails on mobile viewport',
  domain: 'browser-qa',
  environment: { runtime: 'GitHub Actions', node: '24.22.2', browser: 'Chromium' },
  exactError: 'chat composer extends beyond viewport',
  expectedBehavior: 'composer is fully visible in the first viewport',
  reproduction: 'Run browser-smoke.mjs at 390x844',
  severity: 'high',
  rootCause: { status: 'probable', confidence: 'medium', description: 'mobile layout height budget is too large' },
  evidence: [{ kind: 'ci-run', reference: 'https://github.com/example/actions/runs/1' }],
  toolVersions: { playwright: '1.x' },
  attempts: [{ approach: 'reduce panel min-height', outcome: 'inconclusive', details: 'needs cross-browser run' }],
  resourceUsage: { durationMs: 42000, peakMemoryMb: 256 },
  ...overrides,
});

test('engineering issue ledger persists issues and preserves evidence across restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-'));
  try {
    const first = await new EngineeringIssueLedger({ dataDir }).initialize();
    const created = await first.create(issue());
    assert.match(created.id, /^ZFI-/);
    assert.equal(created.status, 'open');
    const restored = await new EngineeringIssueLedger({ dataDir }).initialize();
    const records = await restored.list();
    assert.equal(records.length, 1);
    assert.equal(records[0].evidence[0].reference, 'https://github.com/example/actions/runs/1');
    assert.equal(records[0].attempts[0].outcome, 'inconclusive');
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('engineering issue ledger updates lifecycle, root cause and verified resolution evidence', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-update-'));
  try {
    const ledger = await new EngineeringIssueLedger({ dataDir }).initialize();
    const created = await ledger.create(issue());
    const updated = await ledger.update(created.id, {
      status: 'resolved',
      rootCause: { status: 'confirmed', confidence: 'high', description: 'CSS min-height exceeded the mobile viewport budget' },
      solution: { summary: 'Use viewport-aware panel sizing', verification: 'Chromium, Firefox and WebKit smoke suite passed' },
      regressionTests: ['test/browser-smoke.mjs'],
    });
    assert.equal(updated.status, 'resolved');
    assert.equal(updated.rootCause.status, 'confirmed');
    assert.equal(updated.solution.verification.includes('passed'), true);
    assert.equal((await ledger.get(created.id)).regressionTests[0], 'test/browser-smoke.mjs');
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('engineering issue ledger rejects invalid lifecycle and ungrounded resolution', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-invalid-'));
  try {
    const ledger = await new EngineeringIssueLedger({ dataDir }).initialize();
    const created = await ledger.create(issue());
    await assert.rejects(() => ledger.update(created.id, { status: 'resolved' }), /verified solution evidence/i);
    await assert.rejects(() => ledger.update(created.id, { status: 'made-up' }), /status/i);
    await assert.rejects(() => ledger.create(issue({ severity: 'emergency' })), /severity/i);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('engineering issue ledger serializes concurrent writes without losing records', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-concurrent-'));
  try {
    const ledger = await new EngineeringIssueLedger({ dataDir }).initialize();
    await Promise.all(Array.from({ length: 12 }, (_, index) => ledger.create(issue({ title: 'Issue ' + index }))));
    assert.equal((await ledger.list()).length, 12);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('engineering issue ledger refuses symlinked state files and corrupt JSON', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-link-'));
  const outside = await mkdtemp(join(tmpdir(), 'zforge-issues-outside-'));
  try {
    await writeFile(join(outside, 'engineering-issues.json'), '[]');
    await symlink(join(outside, 'engineering-issues.json'), join(dataDir, 'engineering-issues.json'));
    const ledger = new EngineeringIssueLedger({ dataDir });
    await assert.rejects(() => ledger.initialize(), /symbolic link/i);
    await rm(join(dataDir, 'engineering-issues.json'));
    await writeFile(join(dataDir, 'engineering-issues.json'), '{broken');
    await assert.rejects(() => new EngineeringIssueLedger({ dataDir }).initialize(), /valid JSON/i);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('engineering issue ledger exposes only bounded, relevant records to agent memory', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'zforge-issues-memory-'));
  try {
    const ledger = await new EngineeringIssueLedger({ dataDir, maxRelevant: 2 }).initialize();
    await ledger.create(issue({ title: 'Android Gradle SDK missing', domain: 'android-build' }));
    await ledger.create(issue({ title: 'Voice model missing', domain: 'local-voice' }));
    await ledger.create(issue({ title: 'Browser viewport mismatch', domain: 'browser-qa' }));
    const memory = await ledger.loadRelevant({ request: 'fix browser viewport mismatch' });
    assert.equal(memory.engineeringIssues.length, 2);
    assert.equal(memory.engineeringIssues.some(item => item.domain === 'browser-qa'), true);
    assert.equal(memory.engineeringIssues.every(item => item.id && item.status), true);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
