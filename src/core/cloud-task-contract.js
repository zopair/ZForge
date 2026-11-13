const OWNER = 'zopair';
const TITLE_PREFIX = '[ZForge Cloud Task]';
const MAX_REQUEST_LENGTH = 12000;

export function normalizeCloudTaskRequest({ author, title, body } = {}) {
  if (author !== OWNER) throw new Error('cloud task author is not authorized');
  if (typeof title !== 'string' || !title.startsWith(TITLE_PREFIX)) {
    throw new Error('issue is not a cloud task');
  }
  if (typeof body !== 'string') throw new TypeError('cloud task body must be text');
  const request = body.trim();
  if (!request || request.length > MAX_REQUEST_LENGTH) {
    throw new RangeError('cloud task request must contain 1..12000 characters');
  }
  return { request };
}

export const CLOUD_TASK_TITLE_PREFIX = TITLE_PREFIX;
export const CLOUD_TASK_MAX_REQUEST_LENGTH = MAX_REQUEST_LENGTH;

/**
 * Resolve the only two accepted cloud-task lifecycle events.
 * Opening a task is planning-only; execution requires an explicit owner comment.
 */
export function getCloudTaskPhase({ action, issue, comment } = {}) {
  if (!issue || issue.user?.login !== OWNER) throw new Error('cloud task author is not authorized');
  if (typeof issue.title !== 'string' || !issue.title.startsWith(TITLE_PREFIX)) {
    throw new Error('issue is not a cloud task');
  }
  if (action === 'opened') return { phase: 'plan' };
  if (action === 'created' && /^\/approve-plan [a-f0-9]{64}$/.test(comment?.body?.trim() ?? '')) {
    if (comment.user?.login !== OWNER) throw new Error('cloud task approval is not authorized');
    return { phase: 'execute' };
  }
  if (action === 'created') throw new Error('comment is not an approval command');
  throw new Error('unsupported cloud task event');
}
