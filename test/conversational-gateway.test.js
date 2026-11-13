import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('authenticated conversational API preserves session context and only drafts engineering plans', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-conversation-api-'));
  const observed = [];
  const approvedPlan = JSON.stringify({ plan: 'Inspect source and prepare tests.', requiresApproval: true, executionStarted: false });
  const conversationCore = {
    respond: async ({ message, history }) => {
      observed.push({ message, history });
      if (message.includes('inspect')) {
        return {
          mode: 'plan',
          reply: 'هذه مسودة خطة. لم يبدأ التنفيذ.',
          planning: { plan: 'Inspect source and prepare tests.', requiresApproval: true, executionStarted: false },
          approvedPlan,
          approvedPlanSha256: createHash('sha256').update(approvedPlan).digest('hex'),
          requiresApproval: true,
          executionStarted: false,
        };
      }
      return { mode: 'conversation', reply: 'يمكننا مناقشة ذلك.', executionStarted: false };
    },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'test-secret-token', conversationCore });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' };
  try {
    const unauthorized = await fetch(base + '/api/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) });
    assert.equal(unauthorized.status, 401);

    const first = await fetch(base + '/api/conversation', { method: 'POST', headers, body: JSON.stringify({ message: 'هل يمكننا مناقشة الفكرة؟' }) });
    const firstResult = await first.json();
    assert.equal(firstResult.mode, 'conversation');
    assert.equal(firstResult.executionStarted, false);
    assert.ok(firstResult.conversationId);

    const second = await fetch(base + '/api/conversation', {
      method: 'POST', headers,
      body: JSON.stringify({ message: 'inspect the project', conversationId: firstResult.conversationId }),
    });
    const secondResult = await second.json();
    assert.equal(secondResult.mode, 'plan');
    assert.equal(secondResult.requiresApproval, true);
    assert.equal(secondResult.executionStarted, false);
    assert.equal(typeof secondResult.taskId, 'string');
    assert.equal(observed[1].history.length, 2);
    assert.equal(gateway.store.get(secondResult.taskId).status, 'queued');
    assert.equal(gateway.store.list().length, 1);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
