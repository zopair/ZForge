import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TASK_STATES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
const TRANSITIONS = {
  queued: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['succeeded', 'failed', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
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

  async create({ request, workspaceId = 'default', metadata = {} } = {}) {
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

export function createTaskGateway({ dataDir, token, maxBodyBytes = 1024 * 1024, clock, runtime = null } = {}) {
  if (typeof token !== 'string' || token.length < 16) throw new TypeError('a gateway bearer token of at least 16 characters is required');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new RangeError('maxBodyBytes must be at least 1024');
  const store = new TaskStore({ dataDir, clock });
  const ready = store.initialize();
  const server = createServer(async (request, response) => {
    try {
      await ready;
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, { status: 'ok', service: 'zforge-task-gateway', version: 1 });
      }
      const authorization = request.headers.authorization ?? '';
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!supplied || !safeEqual(supplied, token)) return send(response, 401, { error: 'unauthorized' });

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
