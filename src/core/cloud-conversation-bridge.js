const CORRELATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function assertCorrelationId(value) {
  if (typeof value !== 'string' || !CORRELATION_ID.test(value)) {
    throw new TypeError('a valid cloud conversation correlation id is required');
  }
  return value.toLowerCase();
}

export function createCloudConversationMarker(correlationId) {
  const id = assertCorrelationId(correlationId);
  return '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + id + ' -->';
}

export function extractCloudConversationReply(comments, correlationId) {
  const marker = createCloudConversationMarker(correlationId);
  if (!Array.isArray(comments)) return null;
  const match = [...comments].reverse().find(comment => typeof comment?.body === 'string' && comment.body.includes(marker));
  if (!match) return null;
  const body = match.body.slice(match.body.indexOf(marker) + marker.length).trim();
  return body ? { body } : null;
}

export function extractCloudConversationId(title) {
  if (typeof title !== 'string') return null;
  const match = title.match(/\[ZForgeChat:([a-f0-9-]{36})\]/i);
  if (!match) return null;
  try { return assertCorrelationId(match[1]); }
  catch { return null; }
}
