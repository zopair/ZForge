export class ApiBudgetExceededError extends Error {
  constructor(message, snapshot) {
    super(message);
    this.name = 'ApiBudgetExceededError';
    this.snapshot = snapshot;
  }
}

/** Shared request ledger with optional per-agent allocations; GitHub quota observation remains available to discovery clients. */
export class GlobalApiBudget {
  constructor({ maxRequests = 50, criticalThreshold = 0.10, agentLimits = {} } = {}) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new RangeError('maxRequests must be a positive integer');
    if (typeof criticalThreshold !== 'number' || criticalThreshold <= 0 || criticalThreshold >= 1) throw new RangeError('criticalThreshold must be between 0 and 1');
    this.maxRequests = maxRequests;
    this.criticalThreshold = criticalThreshold;
    this.used = 0;
    this.halted = false;
    this.haltReason = null;
    this.lastQuota = null;
    if (!agentLimits || typeof agentLimits !== 'object' || Array.isArray(agentLimits)) throw new TypeError('agentLimits must be an object');
    for (const [agentId, limit] of Object.entries(agentLimits)) {
      if (!agentId.trim() || !Number.isInteger(limit) || limit < 0) throw new RangeError('agent limits must map agent IDs to non-negative integers');
    }
    this.agentLimits = { ...agentLimits };
    this.agentUsage = new Map();
    this.events = [];
  }
  consume({ method = 'GET', url = 'unknown', agentId = null } = {}) {
    if (this.halted) throw new ApiBudgetExceededError(this.haltReason ?? 'Global API budget is halted.', this.snapshot());
    if (agentId !== null) {
      if (typeof agentId !== 'string' || !agentId.trim()) throw new TypeError('agentId must be a non-empty string');
      const agentLimit = this.agentLimits[agentId];
      if (agentLimit === undefined) throw new ApiBudgetExceededError(`Agent ${agentId} has no web request allocation.`, this.snapshot());
      const agentUsed = this.agentUsage.get(agentId) ?? 0;
      if (agentUsed >= agentLimit) throw new ApiBudgetExceededError(`Agent ${agentId} web request budget exhausted.`, this.snapshot());
    }
    if (this.used >= this.maxRequests) {
      this.halt('Global API request budget exhausted.');
      throw new ApiBudgetExceededError(this.haltReason, this.snapshot());
    }
    this.used += 1;
    if (agentId !== null) this.agentUsage.set(agentId, (this.agentUsage.get(agentId) ?? 0) + 1);
    this.events.push({ index: this.used, method: String(method).toUpperCase(), url: String(url), ...(agentId ? { agentId } : {}) });
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
      agentLimits: { ...this.agentLimits },
      agentUsage: Object.fromEntries(this.agentUsage),
      events: this.events.map(event => ({ ...event })),
    };
  }
}
