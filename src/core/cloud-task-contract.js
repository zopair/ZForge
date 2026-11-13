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
