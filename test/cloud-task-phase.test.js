import test from 'node:test';
import assert from 'node:assert/strict';
import { getCloudTaskPhase } from '../src/core/cloud-task-contract.js';

const issue = { user: { login: 'zopair' }, title: '[ZForge Cloud Task] Build a PWA', body: 'Build it' };

test('new owner task issues are planning-only', () => {
  assert.deepEqual(getCloudTaskPhase({ action: 'opened', issue }), { phase: 'plan' });
});

test('only an owner approval comment can enter execution', () => {
  assert.deepEqual(getCloudTaskPhase({
    action: 'created',
    issue,
    comment: { user: { login: 'zopair' }, body: '/approve-plan ' + 'a'.repeat(64) },
  }), { phase: 'execute' });
});

test('rejects approval comments from non-owners', () => {
  assert.throws(() => getCloudTaskPhase({
    action: 'created',
    issue,
    comment: { user: { login: 'someone-else' }, body: '/approve-plan' },
  }), /not authorized/);
});

test('rejects comments that do not explicitly approve the plan', () => {
  assert.throws(() => getCloudTaskPhase({
    action: 'created',
    issue,
    comment: { user: { login: 'zopair' }, body: 'looks good' },
  }), /not an approval/);
});

test('rejects unsupported events and non-task issues', () => {
  assert.throws(() => getCloudTaskPhase({ action: 'edited', issue }), /unsupported/);
  assert.throws(() => getCloudTaskPhase({
    action: 'opened',
    issue: { ...issue, title: 'ordinary issue' },
  }), /not a cloud task/);
});
