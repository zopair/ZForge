const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createResourcePolicy({
  maxRequests = 8,
  maxRetries = 2,
  baseDelayMs = 250,
  maxDelayMs = 2000,
} = {}) {
  for (const [name, value, min] of [
    ['maxRequests', maxRequests, 1],
    ['maxRetries', maxRetries, 0],
    ['baseDelayMs', baseDelayMs, 0],
    ['maxDelayMs', maxDelayMs, 0],
  ]) {
    if (!Number.isInteger(value) || value < min) throw new RangeError(`${name} is invalid`);
  }
  let requests = 0;
  return Object.freeze({
    get requests() { return requests; },
    get remaining() { return Math.max(0, maxRequests - requests); },
    async run(operation, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
      if (typeof operation !== 'function') throw new TypeError('operation must be a function');
      if (requests >= maxRequests) throw new Error('RESOURCE_BUDGET_EXHAUSTED');
      requests += 1;
      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await operation();
          const status = Number(response?.status ?? 200);
          if (!TRANSIENT.has(status) || attempt >= maxRetries) return response;
          const retryAfter = Number(response?.headers?.get?.('retry-after'));
          const delay = Number.isFinite(retryAfter) && retryAfter >= 0
            ? Math.min(maxDelayMs, retryAfter * 1000)
            : Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
          await sleep(delay);
        } catch (error) {
          if (attempt >= maxRetries || error?.retryable !== true) throw error;
          await sleep(Math.min(maxDelayMs, baseDelayMs * (2 ** attempt)));
        }
      }
    },
  });
}

export async function fetchWithPolicy(url, options = {}, policy = createResourcePolicy()) {
  const response = await policy.run(() => fetch(url, options));
  if ([401, 403, 404].includes(response.status)) {
    throw new Error(`NON_RETRYABLE_HTTP_${response.status}`);
  }
  return response;
}
