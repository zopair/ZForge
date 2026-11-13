import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApprovedPlanSnapshot,
  decodeApprovedPlanSnapshot,
  extractApprovedPlanSnapshot,
} from '../src/core/approved-plan-snapshot.js';

test('approved plan snapshot preserves the exact plan and verifies its SHA-256 fingerprint', () => {
  const plan = { status: 'DRAFT_PLAN', plan: 'Build and verify', requiresApproval: true };
  const created = createApprovedPlanSnapshot({ taskId: 'task-123', plan, generatedAt: '2026-11-13T12:00:00.000Z' });
  const decoded = decodeApprovedPlanSnapshot(created.encoded, { expectedDigest: created.planSha256 });
  assert.deepEqual(decoded.plan, plan);
  assert.equal(decoded.taskId, 'task-123');
  assert.equal(decoded.planSha256, created.planSha256);
});

test('approved plan snapshot rejects tampered content and a mismatched approval digest', () => {
  const created = createApprovedPlanSnapshot({ taskId: 'task-123', plan: { plan: 'original' } });
  const payload = JSON.parse(Buffer.from(created.encoded, 'base64').toString('utf8'));
  payload.plan.plan = 'modified';
  const tampered = Buffer.from(JSON.stringify(payload)).toString('base64');
  assert.throws(() => decodeApprovedPlanSnapshot(tampered), /fingerprint/i);
  assert.throws(() => decodeApprovedPlanSnapshot(created.encoded, { expectedDigest: 'f'.repeat(64) }), /approval fingerprint/i);
});

test('approval loads only a trusted workflow comment containing the exact requested plan digest', () => {
  const created = createApprovedPlanSnapshot({ taskId: 'task-123', plan: { plan: 'exact approved plan' } });
  const comments = [
    { id: 1, user: { login: 'zopair' }, body: '<!-- ZFORGE_PLAN_SNAPSHOT_V1:' + created.encoded + ' -->' },
    { id: 2, user: { login: 'github-actions[bot]' }, body: 'Plan record <!-- ZFORGE_PLAN_SNAPSHOT_V1:' + created.encoded + ' -->' },
  ];
  const result = extractApprovedPlanSnapshot(comments, { expectedDigest: created.planSha256 });
  assert.equal(result.commentId, 2);
  assert.deepEqual(result.plan, { plan: 'exact approved plan' });
});

test('approval refuses missing, malformed or unrelated plan snapshots', () => {
  const created = createApprovedPlanSnapshot({ taskId: 'task-123', plan: { plan: 'exact' } });
  assert.throws(() => extractApprovedPlanSnapshot([], { expectedDigest: created.planSha256 }), /no trusted stored plan/i);
  assert.throws(() => decodeApprovedPlanSnapshot('not-base64'), /encoding is invalid/i);
  assert.throws(() => extractApprovedPlanSnapshot([
    { user: { login: 'github-actions[bot]' }, body: '<!-- ZFORGE_PLAN_SNAPSHOT_V1:' + created.encoded + ' -->' },
  ], { expectedDigest: 'a'.repeat(64) }), /approval fingerprint/i);
});
