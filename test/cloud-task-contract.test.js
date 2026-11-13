import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCloudTaskRequest } from '../src/core/cloud-task-contract.js';

test('accepts a non-empty cloud task only from the repository owner and exact task title prefix', () => {
  assert.deepEqual(normalizeCloudTaskRequest({
    author: 'zopair',
    title: '[ZForge Cloud Task] Build a PWA',
    body: 'Build and verify a responsive PWA.',
  }), { request: 'Build and verify a responsive PWA.' });
});

test('rejects cloud task requests from other GitHub users', () => {
  assert.throws(() => normalizeCloudTaskRequest({
    author: 'untrusted-user',
    title: '[ZForge Cloud Task] Run code',
    body: 'Run a command',
  }), /not authorized/);
});

test('rejects issues that do not use the explicit cloud task prefix', () => {
  assert.throws(() => normalizeCloudTaskRequest({
    author: 'zopair',
    title: 'Ordinary issue',
    body: 'Do work',
  }), /not a cloud task/);
});

test('rejects empty or oversized task requests', () => {
  assert.throws(() => normalizeCloudTaskRequest({
    author: 'zopair',
    title: '[ZForge Cloud Task] Empty',
    body: '   ',
  }), /1\.\.12000/);
  assert.throws(() => normalizeCloudTaskRequest({
    author: 'zopair',
    title: '[ZForge Cloud Task] Large',
    body: 'x'.repeat(12001),
  }), /1\.\.12000/);
});
