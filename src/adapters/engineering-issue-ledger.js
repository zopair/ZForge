import { randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const STATUSES = new Set(['open', 'investigating', 'blocked', 'resolved', 'closed', 'wont-fix']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const ROOT_CAUSE_STATUSES = new Set(['unknown', 'probable', 'confirmed']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const ATTEMPT_OUTCOMES = new Set(['failed', 'inconclusive', 'succeeded', 'abandoned']);
const TERMINAL = new Set(['resolved', 'closed', 'wont-fix']);

function boundedText(value, name, max = 4000, required = false) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) {
    throw new TypeError(name + ' must be ' + (required ? 'a non-empty' : 'a') + ' string up to ' + max + ' characters');
  }
  return value.trim();
}
function boundedList(value, name, max = 30) {
  if (!Array.isArray(value) || value.length > max) throw new TypeError(name + ' must be an array with at most ' + max + ' entries');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError(name + '[' + index + '] must be an object');
    return structuredClone(item);
  });
}
function validateIssue(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('issue must be an object');
  const result = {};
  const requiredFields = ['title', 'domain', 'exactError', 'expectedBehavior', 'reproduction'];
  for (const field of requiredFields) {
    if (!partial || Object.hasOwn(input, field)) result[field] = boundedText(input[field], field, field === 'title' ? 240 : 4000, !partial);
  }
  if (!partial || Object.hasOwn(input, 'environment')) {
    if (!input.environment || typeof input.environment !== 'object' || Array.isArray(input.environment)) throw new TypeError('environment must be an object');
    result.environment = structuredClone(input.environment);
  }
  if (!partial || Object.hasOwn(input, 'severity')) {
    if (!SEVERITIES.has(input.severity)) throw new TypeError('severity is invalid');
    result.severity = input.severity;
  }
  if (!partial || Object.hasOwn(input, 'rootCause')) {
    const rootCause = input.rootCause ?? { status: 'unknown', confidence: 'low', description: '' };
    if (!rootCause || typeof rootCause !== 'object' || !ROOT_CAUSE_STATUSES.has(rootCause.status) || !CONFIDENCE.has(rootCause.confidence)) throw new TypeError('rootCause status or confidence is invalid');
    result.rootCause = { status: rootCause.status, confidence: rootCause.confidence, description: boundedText(rootCause.description ?? '', 'rootCause.description') };
  }
  for (const field of ['evidence', 'attempts', 'regressionTests']) {
    if (!partial || Object.hasOwn(input, field)) {
      if (field === 'regressionTests') {
        if (!Array.isArray(input[field]) || input[field].length > 50 || input[field].some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw new TypeError('regressionTests must contain at most 50 non-empty strings');
        result[field] = [...input[field]];
      } else {
        result[field] = boundedList(input[field] ?? [], field, field === 'evidence' ? 50 : 50);
      }
    }
  }
  if (!partial || Object.hasOwn(input, 'toolVersions')) {
    const versions = input.toolVersions ?? {};
    if (!versions || typeof versions !== 'object' || Array.isArray(versions)) throw new TypeError('toolVersions must be an object');
    result.toolVersions = structuredClone(versions);
  }
  if (!partial || Object.hasOwn(input, 'resourceUsage')) {
    const usage = input.resourceUsage ?? {};
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) throw new TypeError('resourceUsage must be an object');
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError('resourceUsage values must be finite non-negative numbers');
    }
    result.resourceUsage = structuredClone(usage);
  }
  if (Object.hasOwn(input, 'solution')) {
    const solution = input.solution;
    if (!solution || typeof solution !== 'object' || typeof solution.summary !== 'string' || !solution.summary.trim() || typeof solution.verification !== 'string' || !solution.verification.trim()) {
      throw new TypeError('solution requires a summary and verification evidence');
    }
    result.solution = { summary: boundedText(solution.summary, 'solution.summary'), verification: boundedText(solution.verification, 'solution.verification') };
  }
  if (Object.hasOwn(input, 'status')) {
    if (!STATUSES.has(input.status)) throw new TypeError('status is invalid');
    result.status = input.status;
  }
  if (Object.hasOwn(input, 'linkedIssueId')) result.linkedIssueId = boundedText(input.linkedIssueId, 'linkedIssueId', 80);
  if (Object.hasOwn(input, 'workaround')) result.workaround = boundedText(input.workaround, 'workaround');
  return result;
}

export class EngineeringIssueLedger {
  constructor({ dataDir, maxRecords = 2000, maxRelevant = 8, maxFileBytes = 8 * 1024 * 1024, clock = () => new Date().toISOString() } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 10000) throw new RangeError('maxRecords must be between 1 and 10000');
    if (!Number.isInteger(maxRelevant) || maxRelevant < 1 || maxRelevant > 50) throw new RangeError('maxRelevant must be between 1 and 50');
    if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1024) throw new RangeError('maxFileBytes must be at least 1024');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.filePath = join(resolve(dataDir), 'engineering-issues.json');
    this.maxRecords = maxRecords;
    this.maxRelevant = maxRelevant;
    this.maxFileBytes = maxFileBytes;
    this.clock = clock;
    this.records = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(resolve(this.filePath, '..'), { recursive: true });
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('engineering issue ledger must be a regular file, not a symbolic link');
      if (info.size > this.maxFileBytes) throw new RangeError('engineering issue ledger exceeds configured size limit');
      let records;
      try { records = JSON.parse(await readFile(this.filePath, 'utf8')); }
      catch { throw new Error('engineering issue ledger must contain valid JSON'); }
      if (!Array.isArray(records) || records.length > this.maxRecords) throw new Error('engineering issue ledger must contain a bounded array');
      for (const record of records) {
        if (!record || typeof record.id !== 'string' || !STATUSES.has(record.status) || this.records.has(record.id)) throw new Error('engineering issue ledger contains an invalid or duplicate record');
        const validated = validateIssue(record);
        this.records.set(record.id, { ...validated, id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  async create(input) {
    const validated = validateIssue(input);
    if (this.records.size >= this.maxRecords) throw new RangeError('engineering issue ledger record limit reached');
    const now = this.clock();
    const id = 'ZFI-' + now.slice(0, 10).replaceAll('-', '') + '-' + randomUUID().slice(0, 8).toUpperCase();
    const record = { ...validated, status: 'open', id, createdAt: now, updatedAt: now };
    this.records.set(id, record);
    await this.#persist();
    return structuredClone(record);
  }

  async update(id, patch) {
    const current = this.records.get(id);
    if (!current) return null;
    const validated = validateIssue(patch, { partial: true });
    const next = { ...current, ...validated, id, createdAt: current.createdAt, updatedAt: this.clock() };
    if (TERMINAL.has(next.status)) {
      if (!next.solution?.summary || !next.solution?.verification || !next.regressionTests?.length) {
        throw new Error('terminal issue status requires verified solution evidence and regression tests');
      }
    }
    this.records.set(id, next);
    await this.#persist();
    return structuredClone(next);
  }

  get(id) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async list({ status, domain, limit = this.maxRecords } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > this.maxRecords) throw new RangeError('limit is outside the configured range');
    if (status && !STATUSES.has(status)) throw new TypeError('status is invalid');
    return [...this.records.values()]
      .filter(record => (!status || record.status === status) && (!domain || record.domain === domain))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit).map(record => structuredClone(record));
  }

  async loadRelevant({ request = '', capabilities = [] } = {}) {
    const terms = String(request).toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/).filter(term => term.length > 2);
    const capabilitySet = new Set(Array.isArray(capabilities) ? capabilities.map(value => String(value).toLowerCase()) : []);
    const records = [...this.records.values()].map(record => {
      const haystack = [record.title, record.domain, record.exactError, record.expectedBehavior, record.rootCause.description].join(' ').toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) + (capabilitySet.has(record.domain.toLowerCase()) ? 3 : 0);
      return { record, score };
    }).sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt))
      .slice(0, this.maxRelevant).map(({ record }) => ({
        id: record.id, title: record.title, domain: record.domain, status: record.status,
        severity: record.severity, exactError: record.exactError, rootCause: record.rootCause,
        solution: record.solution ?? null, workaround: record.workaround ?? null,
        attempts: record.attempts.slice(0, 8), regressionTests: record.regressionTests.slice(0, 12),
        updatedAt: record.updatedAt,
      }));
    return { engineeringIssues: records, request, capabilities };
  }

  async #persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const payload = JSON.stringify([...this.records.values()]);
      if (Buffer.byteLength(payload) > this.maxFileBytes) throw new RangeError('engineering issue ledger exceeds configured size limit');
      const temporary = this.filePath + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, payload, { mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}
