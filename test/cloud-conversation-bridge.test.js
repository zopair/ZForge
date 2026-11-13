import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCloudConversationMarker,
  extractCloudConversationReply,
  extractCloudConversationId,
} from '../src/core/cloud-conversation-bridge.js';

const id = '9a6b8c2d-4e1f-4a7b-8c3d-2f1e0a9b8c7d';

test('creates a stable marker for correlating a cloud reply to one chat request', () => {
  assert.equal(createCloudConversationMarker(id), '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + id + ' -->');
});

test('extracts only the reply carrying the requested conversation marker', () => {
  const comments = [
    { body: 'unrelated result' },
    { body: '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + id + ' -->\n## BLACK VANTA\nتم تحليل القدرات.' },
  ];
  assert.deepEqual(extractCloudConversationReply(comments, id), {
    body: '## BLACK VANTA\nتم تحليل القدرات.',
  });
});

test('does not mistake another conversation reply for the current request', () => {
  const comments = [{ body: createCloudConversationMarker('1a6b8c2d-4e1f-4a7b-8c3d-2f1e0a9b8c7d') + '\nwrong reply' }];
  assert.equal(extractCloudConversationReply(comments, id), null);
});

test('extracts a valid correlation id from a cloud task issue title', () => {
  assert.equal(extractCloudConversationId('[ZForge Cloud Task] capabilities [ZForgeChat:' + id + ']'), id);
  assert.equal(extractCloudConversationId('[ZForge Cloud Task] capabilities'), null);
});

test('rejects malformed correlation identifiers', () => {
  assert.throws(() => createCloudConversationMarker('not-an-id'), /correlation id/i);
  assert.throws(() => extractCloudConversationReply([], 'not-an-id'), /correlation id/i);
});
