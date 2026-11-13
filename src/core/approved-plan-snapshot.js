import { createHash } from 'node:crypto';

export const APPROVED_PLAN_SNAPSHOT_MARKER = 'ZFORGE_PLAN_SNAPSHOT_V1';
export const MAX_APPROVED_PLAN_SNAPSHOT_BASE64_LENGTH = 48000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createApprovedPlanSnapshot({ taskId, plan, generatedAt = new Date().toISOString() } = {}) {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new TypeError('taskId is required');
  if (plan === undefined || plan === null) throw new TypeError('plan is required');
  const planSha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const payload = { schemaVersion: 1, taskId: taskId.trim(), planSha256, generatedAt, plan };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  if (encoded.length > MAX_APPROVED_PLAN_SNAPSHOT_BASE64_LENGTH) {
    throw new RangeError('approved plan snapshot is too large for a durable issue comment');
  }
  return { payload, encoded, planSha256 };
}

export function decodeApprovedPlanSnapshot(encoded, { expectedDigest } = {}) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > MAX_APPROVED_PLAN_SNAPSHOT_BASE64_LENGTH
    || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new TypeError('approved plan snapshot encoding is invalid');
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { throw new TypeError('approved plan snapshot JSON is invalid'); }
  if (!isRecord(payload) || payload.schemaVersion !== 1 || typeof payload.taskId !== 'string'
    || !payload.taskId.trim() || payload.plan === undefined || payload.plan === null
    || !/^[a-f0-9]{64}$/.test(payload.planSha256 ?? '')) {
    throw new TypeError('approved plan snapshot schema is invalid');
  }
  const actualDigest = createHash('sha256').update(JSON.stringify(payload.plan)).digest('hex');
  if (actualDigest !== payload.planSha256) throw new Error('stored plan fingerprint does not match its contents');
  if (expectedDigest !== undefined && payload.planSha256 !== expectedDigest) {
    throw new Error('approval fingerprint does not match the stored plan');
  }
  return payload;
}

export function extractApprovedPlanSnapshot(comments, { expectedDigest, botLogin = 'github-actions[bot]' } = {}) {
  if (!Array.isArray(comments)) throw new TypeError('comments must be an array');
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) throw new TypeError('expectedDigest must be a SHA-256 fingerprint');
  for (const comment of [...comments].reverse()) {
    if (comment?.user?.login !== botLogin || typeof comment.body !== 'string') continue;
    const pattern = new RegExp('<!--\\\\s*' + APPROVED_PLAN_SNAPSHOT_MARKER + ':([A-Za-z0-9+/=]+)\\\\s*-->');
    const match = comment.body.match(pattern);
    if (!match) continue;
    const payload = decodeApprovedPlanSnapshot(match[1], { expectedDigest });
    return { ...payload, commentId: comment.id ?? null };
  }
  throw new Error('no trusted stored plan matches this approval fingerprint');
}
