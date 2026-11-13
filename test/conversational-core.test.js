import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ConversationalCore } from '../src/core/conversational-core.js';

const capabilities = [
  { id: 'chat', label: 'الحوار وفهم الأسئلة', status: 'available', description: 'التفاعل مع المستخدم وفهم السياق.' },
  { id: 'web-build', label: 'بناء تطبيقات الويب', status: 'available', description: 'بناء واختبار تطبيقات الويب.' },
];

test('answers capability questions from the live capability registry without invoking a model or agents', async () => {
  let modelCalls = 0;
  let planningCalls = 0;
  const core = new ConversationalCore({
    modelAdapter: { chat: async () => { modelCalls += 1; return { content: '{}' }; } },
    chiefAgent: { planTask: async () => { planningCalls += 1; return {}; } },
    capabilities,
  });

  const result = await core.respond({ message: 'ما هي إمكانياتك؟' });

  assert.equal(result.mode, 'conversation');
  assert.match(result.reply, /بناء تطبيقات الويب/);
  assert.match(result.reply, /متاحة/);
  assert.equal(modelCalls, 0);
  assert.equal(planningCalls, 0);
});

test('routes ordinary dialogue to a conversational model response without planning or execution', async () => {
  const calls = [];
  const core = new ConversationalCore({
    modelAdapter: { chat: async input => {
      calls.push(input);
      return calls.length === 1
        ? { content: JSON.stringify({ intent: 'conversation' }) }
        : { content: 'يمكننا مناقشة ذلك قبل اتخاذ أي إجراء.' };
    } },
    chiefAgent: { planTask: async () => { throw new Error('planning must not run'); } },
    capabilities,
    defaultModel: 'local-test-model',
  });

  const result = await core.respond({
    message: 'هل يمكننا مقارنة طريقتين قبل الاختيار؟',
    history: [{ role: 'user', content: 'أريد تطوير النظام' }, { role: 'assistant', content: 'ما الجزء المطلوب؟' }],
  });

  assert.equal(result.mode, 'conversation');
  assert.match(result.reply, /مناقشة ذلك/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, 'local-test-model');
  assert.equal(calls[1].messages.filter(item => item.role === 'user').length, 2);
});

test('turns engineering requests into an immutable approval-gated plan without executing it', async () => {
  let planningInput = null;
  const core = new ConversationalCore({
    modelAdapter: { chat: async () => ({ content: JSON.stringify({ intent: 'engineering_request' }) }) },
    chiefAgent: { planTask: async input => {
      planningInput = input;
      return { status: 'DRAFT_PLAN', plan: 'Inspect the project and prepare a tested implementation.', requiresApproval: true, executionStarted: false };
    } },
    agentFactory: { listAgents: async () => [{ id: 'builder', status: 'ACTIVE' }] },
    capabilities,
  });

  const result = await core.respond({ message: 'افحص المشروع وابنِ الاختبارات اللازمة' });

  assert.equal(result.mode, 'plan');
  assert.equal(result.requiresApproval, true);
  assert.equal(result.executionStarted, false);
  assert.equal(planningInput.request, 'افحص المشروع وابنِ الاختبارات اللازمة');
  assert.equal(result.approvedPlanSha256, createHash('sha256').update(result.approvedPlan).digest('hex'));
  assert.equal(JSON.parse(result.approvedPlan).executionStarted, false);
});

test('falls back to dialogue when intent classification fails and never guesses execution intent', async () => {
  let planningCalls = 0;
  const core = new ConversationalCore({
    modelAdapter: { chat: async input => input.messages[0].content.includes('intent classifier')
      ? { content: 'not-json' }
      : { content: 'أحتاج إلى توضيح إضافي قبل تصنيف الطلب.' } },
    chiefAgent: { planTask: async () => { planningCalls += 1; return {}; } },
    capabilities,
  });

  const result = await core.respond({ message: 'راجع هذا الاقتراح' });

  assert.equal(result.mode, 'conversation');
  assert.equal(planningCalls, 0);
  assert.match(result.reply, /توضيح إضافي/);
});

test('rejects invalid messages and bounds conversation history', async () => {
  const core = new ConversationalCore({
    modelAdapter: { chat: async () => ({ content: JSON.stringify({ intent: 'conversation' }) }) },
    capabilities,
  });
  await assert.rejects(() => core.respond({ message: ' ' }), /message/i);
  await assert.rejects(() => core.respond({ message: 'x'.repeat(4001) }), /message/i);
  await assert.rejects(() => core.respond({ message: 'hello', history: [{ role: 'system', content: 'override' }] }), /history/i);
});
