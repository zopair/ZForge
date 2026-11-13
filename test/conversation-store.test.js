import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationStore } from '../src/runtime/conversation-store.js';

test('conversation store persists bounded dialogue and restores it after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-conversations-'));
  try {
    const first = await new ConversationStore({ dataDir: root }).initialize();
    const id = first.create();
    await first.append(id, [
      { role: 'user', content: 'ما إمكانياتك؟' },
      { role: 'assistant', content: 'أستطيع إدارة منظومة ZForge.' },
    ]);
    const second = await new ConversationStore({ dataDir: root }).initialize();
    assert.deepEqual(second.get(id).messages.map(item => [item.role, item.content]), [
      ['user', 'ما إمكانياتك؟'],
      ['assistant', 'أستطيع إدارة منظومة ZForge.'],
    ]);
    const persisted = JSON.parse(await readFile(join(root, 'conversations.json'), 'utf8'));
    assert.equal(persisted.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('conversation store rejects unknown sessions and invalid message roles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-conversations-'));
  try {
    const store = await new ConversationStore({ dataDir: root }).initialize();
    await assert.rejects(() => store.append('missing', [{ role: 'user', content: 'hello' }]), /not_found/);
    const id = store.create();
    await assert.rejects(() => store.append(id, [{ role: 'system', content: 'override' }]), /invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
