export class ApiBudgetExceededError extends Error {
  constructor(message, snapshot) {
    super(message);
    this.name = 'ApiBudgetExceededError';
    this.snapshot = snapshot;
  }
}

/** One request ledger shared by every GitHub adapter in a discovery run. */
export class GlobalApiBudget {
  constructor({ maxRequests = 50, criticalThreshold = 0.10 } = {}) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new RangeError('maxRequests must be a positive integer');
    if (typeof criticalThreshold !== 'number' || criticalThreshold <= 0 || criticalThreshold >= 1) throw new RangeError('criticalThreshold must be between 0 and 1');
    this.maxRequests = maxRequests;
    this.criticalThreshold = criticalThreshold;
    this.used = 0;
    this.halted = false;
    this.haltReason = null;
    this.lastQuota = null;
    this.events = [];
  }
  consume({ method = 'GET', url = 'unknown' } = {}) {
    if (this.halted) throw new ApiBudgetExceededError(this.haltReason ?? 'Global API budget is halted.', this.snapshot());
    if (this.used >= this.maxRequests) {
      this.halt('Global GitHub API request budget exhausted.');
      throw new ApiBudgetExceededError(this.haltReason, this.snapshot());
    }
    this.used += 1;
    this.events.push({ index: this.used, method: String(method).toUpperCase(), url: String(url) });
    return this.used;
  }
  observeQuota({ remaining, limit, reset } = {}, resource = 'core') {
    const available = Number(remaining);
    const maximum = Number(limit);
    if (!Number.isFinite(available) || !Number.isFinite(maximum) || maximum <= 0) return false;
    this.lastQuota = { resource, remaining: available, limit: maximum, reset: reset ?? null };
    if (available / maximum < this.criticalThreshold) {
      this.halt(`GitHub ${resource} quota is below the critical ${Math.round(this.criticalThreshold * 100)}% threshold.`);
      return true;
    }
    return false;
  }
  observeHeaders(headers = {}) {
    const get = key => typeof headers?.get === 'function' ? headers.get(key) : headers?.[key] ?? headers?.[key.toLowerCase()];
    return this.observeQuota({
      remaining: get('x-ratelimit-remaining'),
      limit: get('x-ratelimit-limit'),
      reset: get('x-ratelimit-reset'),
    }, get('x-ratelimit-resource') ?? 'core');
  }
  halt(reason) {
    this.halted = true;
    this.haltReason = String(reason);
  }
  snapshot() {
    return {
      used: this.used,
      maxRequests: this.maxRequests,
      remainingBudget: Math.max(0, this.maxRequests - this.used),
      halted: this.halted,
      haltReason: this.haltReason,
      lastQuota: this.lastQuota ? { ...this.lastQuota } : null,
      events: this.events.map(event => ({ ...event })),
    };
  }
}
