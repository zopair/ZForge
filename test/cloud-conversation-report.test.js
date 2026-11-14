import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaModelAdapter } from '../src/adapters/ollama-model-adapter.js';
import { createCloudConversationReport } from '../src/core/cloud-conversation-report.js';

test('Ollama model adapter accepts a cloud-specific 240 second request timeout', () => {
  const adapter = new OllamaModelAdapter({ timeoutMs: 240000, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  assert.equal(adapter.timeoutMs, 240000);
});

test('cloud conversation planning failures are terminal failures, never successful completions', () => {
  const report = createCloudConversationReport({
    mode: 'conversation',
    intent: 'engineering_request',
    diagnosticCode: 'planning_failed',
    reply: 'تعذر إعداد خطة موثوقة. لم يبدأ التنفيذ.',
    executionStarted: false,
  }, { model: 'qwen2.5:1.5b', generatedAt: '2026-11-14T00:00:00.000Z' });
  assert.equal(report.status, 'planning_failed');
  assert.equal(report.executionStarted, false);
  assert.equal(report.diagnosticCode, 'planning_failed');
});

test('ordinary conversation replies use answered terminal state', () => {
  const report = createCloudConversationReport({
    mode: 'conversation',
    reply: 'مرحبا',
    executionStarted: false,
  }, { model: 'qwen2.5:1.5b', generatedAt: '2026-11-14T00:00:00.000Z' });
  assert.equal(report.status, 'answered');
});

test('engineering plans remain awaiting approval and are never marked executed', () => {
  const report = createCloudConversationReport({
    mode: 'plan',
    taskId: 'task-1',
    reply: 'خطة',
    planning: { plan: 'inspect', requiresApproval: true, executionStarted: false },
    executionStarted: false,
  }, { model: 'qwen2.5:1.5b', generatedAt: '2026-11-14T00:00:00.000Z' });
  assert.equal(report.status, 'awaiting_approval');
  assert.equal(report.executionStarted, false);
});
