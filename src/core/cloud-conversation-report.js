import { createHash } from 'node:crypto';

export function createCloudConversationReport(result, { model, generatedAt = new Date().toISOString() } = {}) {
  if (!result || typeof result !== 'object') throw new TypeError('conversation result is required');
  if (typeof model !== 'string' || !model.trim()) throw new TypeError('model is required');
  const reply = String(result.reply ?? '').slice(0, 9000);
  const diagnosticCode = typeof result.diagnosticCode === 'string' ? result.diagnosticCode : null;
  let status;
  if (diagnosticCode === 'planning_failed') status = 'planning_failed';
  else if (diagnosticCode === 'model_timeout' || diagnosticCode === 'timed_out') status = 'timed_out';
  else if (result.mode === 'plan') status = 'awaiting_approval';
  else if (reply.trim()) status = 'answered';
  else status = 'failed';

  const plan = result.planning ?? null;
  const report = {
    status,
    phase: 'conversation',
    taskId: result.taskId ?? null,
    model,
    reply,
    summary: status === 'awaiting_approval'
      ? 'تم إعداد خطة تنتظر موافقتك. لم يبدأ التنفيذ.'
      : status === 'answered'
        ? 'أجاب BLACK VANTA عن الرسالة دون بدء تنفيذ.'
        : status === 'planning_failed'
          ? 'فشل إعداد الخطة. لم يبدأ أي تنفيذ.'
          : status === 'timed_out'
            ? 'انتهت مهلة النموذج. لم يبدأ أي تنفيذ.'
            : 'لم يتمكن العامل من إنتاج رد صالح.',
    plan,
    planSha256: plan ? createHash('sha256').update(JSON.stringify(plan)).digest('hex') : null,
    executionStarted: result.executionStarted === true,
    diagnosticCode,
    generatedAt,
  };

  if (status === 'awaiting_approval' && (!plan || !report.taskId || result.executionStarted !== false)) {
    throw new Error('The conversational planning response violated the approval-only contract.');
  }
  if (['planning_failed', 'timed_out', 'failed'].includes(status) && report.executionStarted) {
    throw new Error('A failed conversation report cannot claim that execution started.');
  }
  return report;
}
