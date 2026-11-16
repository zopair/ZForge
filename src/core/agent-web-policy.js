import { readFile } from 'node:fs/promises';
import { GlobalApiBudget } from './global-api-budget.js';

function validatePolicy(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || config.version !== 1) throw new TypeError('agent policy configuration version 1 is required');
  const web = config.webAccess;
  if (!web || typeof web !== 'object' || typeof web.enabled !== 'boolean') throw new TypeError('webAccess.enabled is required');
  if (!Number.isInteger(web.maxRequestsPerTask) || web.maxRequestsPerTask < 1 || web.maxRequestsPerTask > 100) throw new RangeError('maxRequestsPerTask must be 1..100');
  if (!Number.isInteger(web.defaultAgentQuota) || web.defaultAgentQuota < 0) throw new RangeError('defaultAgentQuota must be a non-negative integer');
  if (!web.agents || typeof web.agents !== 'object' || Array.isArray(web.agents)) throw new TypeError('webAccess.agents must be an object');
  for (const [agentId, policy] of Object.entries(web.agents)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(agentId)) throw new TypeError('agent policy ID is invalid');
    if (!policy || typeof policy !== 'object' || typeof policy.enabled !== 'boolean') throw new TypeError(`agent policy ${agentId} is invalid`);
    if (!Number.isInteger(policy.maxRequests) || policy.maxRequests < 0 || policy.maxRequests > web.maxRequestsPerTask) throw new RangeError(`agent quota for ${agentId} must be within the task budget`);
    if (!Array.isArray(policy.allowedOperations) || policy.allowedOperations.some(value => !['search', 'fetch'].includes(value))) throw new TypeError(`allowedOperations for ${agentId} must contain search/fetch only`);
  }
  return config;
}

export class AgentWebPolicy {
  constructor(config) {
    this.config = validatePolicy(config);
    this.agentLimits = Object.fromEntries(Object.entries(config.webAccess.agents)
      .filter(([, policy]) => policy.enabled)
      .map(([agentId, policy]) => [agentId, policy.maxRequests]));
  }
  isEnabled() { return this.config.webAccess.enabled; }
  getAgentPolicy(agentId) {
    if (!this.isEnabled()) return null;
    const policy = this.config.webAccess.agents[agentId];
    if (!policy?.enabled) return null;
    return { enabled: true, maxRequests: policy.maxRequests, allowedOperations: [...policy.allowedOperations] };
  }
  createTaskBudget() {
    if (!this.isEnabled()) return null;
    return new GlobalApiBudget({ maxRequests: this.config.webAccess.maxRequestsPerTask, agentLimits: this.agentLimits });
  }
}

export async function loadAgentWebPolicy({ filePath = new URL('../../config/agent-policies.json', import.meta.url) } = {}) {
  return new AgentWebPolicy(JSON.parse(await readFile(filePath, 'utf8')));
}
