import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TASK_STATES = new Set(['queued', 'running', 'succeeded', 'failed', 'inconclusive', 'cancelled']);
const TRANSITIONS = {
  queued: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['succeeded', 'failed', 'inconclusive', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  inconclusive: new Set(),
  cancelled: new Set(),
};

function isValidOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendBinary(response, content, filename) {
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': content.length,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(content);
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readJson(request, maxBodyBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON body must be an object');
    return value;
  } catch {
    throw Object.assign(new Error('request body must be valid JSON object'), { statusCode: 400 });
  }
}

export class TaskStore {
  constructor({ dataDir, clock = () => new Date().toISOString() } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'tasks.json');
    this.clock = clock;
    this.tasks = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const records = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(records)) throw new Error('task ledger must contain an array');
      for (const record of records) {
        if (!record || typeof record.id !== 'string' || !TASK_STATES.has(record.status)) throw new Error('task ledger contains an invalid record');
        this.tasks.set(record.id, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id) {
    return this.tasks.has(id) ? structuredClone(this.tasks.get(id)) : null;
  }

  async create({ request, workspaceId = `task-${randomUUID()}`, metadata = {} } = {}) {
    if (typeof request !== 'string' || !request.trim() || request.length > 12000) throw Object.assign(new TypeError('request must contain 1..12000 characters'), { statusCode: 400 });
    if (typeof workspaceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(workspaceId) || workspaceId === '.' || workspaceId === '..') throw Object.assign(new TypeError('workspaceId is invalid'), { statusCode: 400 });
    const now = this.clock();
    const task = {
      id: randomUUID(),
      request: request.trim(),
      workspaceId,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? structuredClone(metadata) : {},
      status: 'queued',
      result: null,
      error: null,
      events: [{ id: randomUUID(), type: 'task.queued', at: now }],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    await this.#persist();
    return structuredClone(task);
  }

  async transition(id, status, { result = null, error = null, details = {} } = {}) {
    if (!TASK_STATES.has(status)) throw Object.assign(new TypeError('unsupported task status'), { statusCode: 400 });
    const task = this.tasks.get(id);
    if (!task) return null;
    if (!TRANSITIONS[task.status].has(status)) throw Object.assign(new Error(`invalid task transition: ${task.status} -> ${status}`), { statusCode: 409 });
    const now = this.clock();
    task.status = status;
    task.result = result;
    task.error = error;
    task.updatedAt = now;
    task.events.push({ id: randomUUID(), type: `task.${status}`, at: now, details: structuredClone(details) });
    await this.#persist();
    return structuredClone(task);
  }

  async #persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.list(), null, 2), { mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}

export function createTaskGateway({ dataDir, token, maxBodyBytes = 1024 * 1024, clock, runtime = null, agentService = null, chiefAgent = null, artifactStore = null, defaultModel = 'qwen3:8b', allowedOrigins = [] } = {}) {
  if (typeof token !== 'string' || token.length < 16) throw new TypeError('a gateway bearer token of at least 16 characters is required');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new RangeError('maxBodyBytes must be at least 1024');
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some(origin => typeof origin !== 'string' || !isValidOrigin(origin))) throw new TypeError('allowedOrigins must be an array of exact HTTP(S) origins');
  const store = new TaskStore({ dataDir, clock });
  const ready = store.initialize();
  const server = createServer(async (request, response) => {
    try {
      await ready;
      const origin = request.headers.origin;
      const originAllowed = Boolean(origin && allowedOrigins.includes(origin));
      if (originAllowed) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        if (!originAllowed) return send(response, 403, { error: 'origin_not_allowed' });
        response.writeHead(204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization,Content-Type',
          'Access-Control-Max-Age': '600',
          'Vary': 'Origin',
        });
        return response.end();
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, { status: 'ok', service: 'zforge-task-gateway', version: 1 });
      }
      const authorization = request.headers.authorization ?? '';
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!supplied || !safeEqual(supplied, token)) return send(response, 401, { error: 'unauthorized' });

      if (request.method === 'GET' && url.pathname === '/api/artifacts') {
        if (!artifactStore) return send(response, 503, { error: 'artifact_store_unavailable' });
        return send(response, 200, { artifacts: artifactStore.listArtifacts() });
      }
      const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([A-Za-z0-9._-]{1,64})(\/download)?$/);
      if (artifactMatch && request.method === 'GET') {
        if (!artifactStore) return send(response, 503, { error: 'artifact_store_unavailable' });
        if (artifactMatch[2] === '/download') {
          const artifact = await artifactStore.readArtifact(artifactMatch[1]);
          return artifact ? sendBinary(response, artifact.content, artifact.metadata.filename) : send(response, 404, { error: 'artifact_not_found' });
        }
        const artifact = artifactStore.getArtifact(artifactMatch[1]);
        return artifact ? send(response, 200, artifact) : send(response, 404, { error: 'artifact_not_found' });
      }
      if (request.method === 'GET' && url.pathname === '/api/models') {
        if (!agentService || typeof agentService.listModels !== 'function') return send(response, 503, { error: 'model_inventory_unavailable' });
        return send(response, 200, { models: await agentService.listModels() });
      }
      if (request.method === 'GET' && url.pathname === '/api/tasks') {
        return send(response, 200, { tasks: store.list() });
      }
      if (request.method === 'POST' && url.pathname === '/api/workspaces') {
        if (!runtime) return send(response, 503, { error: 'execution_runtime_unavailable' });
        const body = await readJson(request, maxBodyBytes);
        const workspace = await runtime.createWorkspace({ id: body.id });
        return send(response, 201, { id: workspace.id, ready: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/tasks') {
        const task = await store.create(await readJson(request, maxBodyBytes));
        return send(response, 201, task);
      }
      const executeMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/execute$/i);
      if (executeMatch && request.method === 'POST') {
        if (!runtime) return send(response, 503, { error: 'execution_runtime_unavailable' });
        const task = store.get(executeMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        await runtime.createWorkspace({ id: task.workspaceId });
        await store.transition(task.id, 'running', { details: { command: body.command } });
        try {
          const result = await runtime.execute({
            workspaceId: task.workspaceId,
            command: body.command,
            args: body.args ?? [],
            env: body.env ?? {},
            timeoutMs: body.timeoutMs,
            cwd: body.cwd ?? '.',
          });
          const status = result.exitCode === 0 ? 'succeeded' : 'failed';
          const completed = await store.transition(task.id, status, {
            result,
            error: result.exitCode === 0 ? null : `process exited with code ${result.exitCode}`,
            details: { exitCode: result.exitCode, signal: result.signal },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', {
            error: error.message,
            details: { timedOut: /timed out/i.test(error.message) },
          });
          return send(response, 200, failed);
        }
      }
      const agentMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/agent-run$/i);
      if (agentMatch && request.method === 'POST') {
        if (!agentService) return send(response, 503, { error: 'agent_execution_unavailable' });
        const task = store.get(agentMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel;
        await store.transition(task.id, 'running', { details: { mode: 'local-agent', model } });
        try {
          const capabilities = Array.isArray(body.capabilities) ? body.capabilities.slice(0, 20).map(String) : [];
          const keywords = Array.isArray(body.keywords)
            ? body.keywords.slice(0, 12).map(String)
            : [...new Set(task.request.match(/[\\p{L}\\p{N}._+-]{3,}/gu) ?? [])].slice(0, 12);
          const planning = chiefAgent
            ? await chiefAgent.planTask({ request: task.request, capabilities, keywords })
            : null;
          const execution = await agentService.runTask({
            request: task.request,
            model,
            workspaceId: task.workspaceId,
            plan: planning?.plan ?? (typeof body.approvedPlan === 'string' ? body.approvedPlan : null),
          });
          const result = { ...execution, planning: planning ? {
            status: planning.status,
            discoveryStatus: planning.discoveryStatus,
            candidatesConsidered: planning.candidatesConsidered,
            proposedInternalBuilds: planning.proposedInternalBuilds,
          } : null };
          const status = result.completed === true ? 'succeeded' : 'inconclusive';
          const completed = await store.transition(task.id, status, {
            result,
            error: result.completed === true ? null : 'agent did not provide verified completion evidence',
            details: { steps: result.steps ?? 0, agentStatus: result.status ?? 'unknown' },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', { error: error.message, details: { mode: 'local-agent' } });
          return send(response, 200, failed);
        }
      }
      const match = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})$/i);
      if (match && request.method === 'GET') {
        const task = store.get(match[1]);
        return task ? send(response, 200, task) : send(response, 404, { error: 'task_not_found' });
      }
      if (match && request.method === 'PATCH') {
        const body = await readJson(request, maxBodyBytes);
        const task = await store.transition(match[1], body.status, body);
        return task ? send(response, 200, task) : send(response, 404, { error: 'task_not_found' });
      }
      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      return send(response, error.statusCode ?? 500, { error: error.statusCode ? error.message : 'internal_error' });
    }
  });
  return { server, store, ready };
}
