import { validateAgentManifest, evaluateAgentActivation } from './agent-architect.js';

const REQUIRED_TESTS = ['representative', 'edge', 'adversarial', 'missing-dependency', 'quota-exhaustion'];
const TOOL_PERMISSION = {
  run_command: ['test:run', 'code:execute'],
  read_file: ['workspace:read'],
  list_files: ['workspace:read'],
  write_file: ['workspace:write'],
  publish_artifact: ['artifact:publish'],
};
const EXECUTION_TOOLS = new Set(Object.keys(TOOL_PERMISSION));

function clone(value) { return structuredClone(value); }

export class AgentFactory {
  constructor({ registry } = {}) {
    if (!registry || typeof registry.get !== 'function' || (!(registry instanceof Map) && typeof registry.list !== 'function')) throw new TypeError('registry must provide get and list');
    this.registry = registry;
  }

  async #save(record) {
    if (this.registry instanceof Map) {
      this.registry.set(record.manifest.id, clone(record));
      return clone(record);
    }
    if (typeof this.registry.save !== 'function') throw new TypeError('registry must provide save');
    return this.registry.save(record);
  }

  async #get(id) {
    const record = await this.registry.get(id);
    if (!record) throw new Error(`agent not found: ${id}`);
    return record;
  }

  async proposeAgent({ manifest, authorId } = {}) {
    if (typeof authorId !== 'string' || !authorId.trim()) throw new TypeError('authorId is required');
    const proposed = clone(manifest);
    proposed.status = 'PROPOSED';
    validateAgentManifest(proposed);
    if (await this.registry.get(proposed.id)) throw new Error(`agent already exists: ${proposed.id}`);
    const now = new Date().toISOString();
    const record = {
      manifest: proposed,
      authorId,
      status: 'PROPOSED',
      testResults: {},
      review: null,
      activation: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.#save(record);
    return clone(record);
  }

  async recordTestResult({ agentId, testName, status, evidence, recordedBy } = {}) {
    const record = await this.#get(agentId);
    if (!REQUIRED_TESTS.includes(testName) || !record.manifest.tests.includes(testName)) throw new TypeError('testName is not a required manifest test');
    if (!['passed', 'failed'].includes(status)) throw new TypeError('test status must be passed or failed');
    if (typeof evidence !== 'string' || !evidence.trim()) throw new TypeError('test evidence is required');
    if (typeof recordedBy !== 'string' || !recordedBy.trim()) throw new TypeError('recordedBy is required');
    record.manifest.status = 'TESTING';
    record.status = 'TESTING';
    record.testResults[testName] = { status, evidence: evidence.trim(), recordedBy, recordedAt: new Date().toISOString() };
    record.updatedAt = new Date().toISOString();
    await this.#save(record);
    return this.evaluateActivation(agentId);
  }

  async recordReview({ agentId, reviewerId, licenseVerified, securityReviewed, permissionsReviewed } = {}) {
    const record = await this.#get(agentId);
    if (typeof reviewerId !== 'string' || !reviewerId.trim() || reviewerId === record.authorId) throw new Error('an independent reviewer is required');
    for (const value of [licenseVerified, securityReviewed, permissionsReviewed]) {
      if (value !== true && value !== false && value !== null) throw new TypeError('review fields must be true, false or null');
    }
    record.review = { reviewerId, licenseVerified, securityReviewed, permissionsReviewed, reviewedAt: new Date().toISOString() };
    record.updatedAt = new Date().toISOString();
    await this.#save(record);
    return this.evaluateActivation(agentId);
  }

  async evaluateActivation(agentId) {
    const record = await this.#get(agentId);
    const results = Object.fromEntries(REQUIRED_TESTS.map(name => [name, record.testResults[name]?.status ?? null]));
    const evaluation = evaluateAgentActivation(record.manifest, {
      testResults: results,
      licenseVerified: record.review?.licenseVerified ?? null,
      securityReviewed: record.review?.securityReviewed ?? null,
      permissionsReviewed: record.review?.permissionsReviewed ?? null,
    });
    return { ...evaluation, agentId, testResults: results, review: record.review ? clone(record.review) : null };
  }

  async activate({ agentId, approved, approverId } = {}) {
    const evaluation = await this.evaluateActivation(agentId);
    if (!evaluation.eligibleForActivation) return { ...evaluation, activated: false };
    if (approved !== true) return { ...evaluation, activated: false };
    const record = await this.#get(agentId);
    if (typeof approverId !== 'string' || !approverId.trim() || approverId === record.authorId || approverId === record.review?.reviewerId) {
      throw new Error('activation requires an independent approver distinct from author and reviewer');
    }
    record.manifest.status = 'ACTIVE';
    record.status = 'ACTIVE';
    record.activation = { approvedBy: approverId, approvedAt: new Date().toISOString() };
    record.updatedAt = new Date().toISOString();
    await this.#save(record);
    return { activated: true, status: 'ACTIVE', agentId, activation: clone(record.activation), executionProfile: await this.getExecutionProfile(agentId) };
  }

  async getExecutionProfile(agentId) {
    const record = await this.#get(agentId);
    if (record.status !== 'ACTIVE' || record.manifest.status !== 'ACTIVE') throw new Error('agent must be independently activated before execution');
    const declared = record.manifest.tools.map(tool => typeof tool === 'string' ? tool : tool?.id).filter(Boolean);
    const allowed = new Set(record.manifest.permissions.allow);
    const denied = new Set(record.manifest.permissions.deny);
    const approvalRequired = new Set(record.manifest.permissions.approvalRequired);
    const allowedTools = [];
    const unavailableTools = [];
    const approvalRequiredTools = [];
    for (const tool of declared) {
      if (!EXECUTION_TOOLS.has(tool)) { unavailableTools.push(tool); continue; }
      const permissions = TOOL_PERMISSION[tool];
      if (permissions.some(permission => denied.has(permission))) continue;
      if (permissions.some(permission => approvalRequired.has(permission))) { approvalRequiredTools.push(tool); continue; }
      if (permissions.some(permission => allowed.has(permission))) allowedTools.push(tool);
    }
    return {
      agentId,
      name: record.manifest.name,
      version: record.manifest.version,
      allowedTools: [...new Set([...allowedTools, 'finish_task'])],
      unavailableTools,
      approvalRequiredTools,
      resourceLimits: clone(record.manifest.resourceLimits),
      permissions: clone(record.manifest.permissions),
    };
  }

  async deactivateAgent({ agentId, approved, approverId, reason } = {}) {
    const record = await this.#get(agentId);
    if (record.status !== 'ACTIVE') throw new Error('only an active agent can be deactivated');
    if (approved !== true) throw new Error('explicit deactivation approval is required');
    if (typeof approverId !== 'string' || !approverId.trim()) throw new TypeError('approverId is required');
    if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('deactivation reason is required');
    record.manifest.status = 'RETIRED';
    record.status = 'RETIRED';
    record.deactivation = { approvedBy: approverId, reason: reason.trim(), deactivatedAt: new Date().toISOString() };
    record.updatedAt = new Date().toISOString();
    await this.#save(record);
    return { agentId, status: 'RETIRED', deactivation: clone(record.deactivation) };
  }

  async listAgents() {
    const records = this.registry instanceof Map ? [...this.registry.values()] : await this.registry.list();
    return records.map(record => ({
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      status: record.status,
      mission: record.manifest.mission,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  async getAgent(agentId) { return this.#get(agentId); }
}
