import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCloudIssueUrl } from '../src/core/cloud-issue-handoff.js';

test('creates a short issue URL without embedding task content', () => {
  const url = new URL(buildCloudIssueUrl());

  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/zopair/ZForge/issues/new');
  assert.equal(url.searchParams.get('title'), '[ZForge Cloud Task]');
  assert.equal(url.searchParams.has('body'), false);
  assert.ok(url.toString().length < 200);
});

test('keeps the issue handoff URL independent of prompt length', () => {
  const shortPrompt = 'Build a web application.';
  const longPrompt = 'Build a web application. '.repeat(5000);

  assert.equal(buildCloudIssueUrl(shortPrompt), buildCloudIssueUrl(longPrompt));
  assert.ok(buildCloudIssueUrl(longPrompt).length < 200);
});
