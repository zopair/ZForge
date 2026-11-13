import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDiscoveryPlan } from '../core/discovery-engine.js';
import { ConversationStore } from './conversation-store.js';

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

async function readRaw(request, maxBodyBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (size === 0) throw Object.assign(new Error('request body is empty'), { statusCode: 400 });
  return Buffer.concat(chunks);
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
        if (!Array.isArray(record.events)) record.events = [];
        record.events = record.events.map((event, index) => ({ ...event, sequence: Number.isInteger(event.sequence) ? event.sequence : index + 1 }));
        record.eventSequence = Number.isInteger(record.eventSequence) ? record.eventSequence : record.events.reduce((max, event) => Math.max(max, event.sequence), 0);
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
      events: [{ id: randomUUID(), sequence: 1, type: 'task.queued', at: now }],
      eventSequence: 1,
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
    task.events.push({ id: randomUUID(), sequence: ++task.eventSequence, type: `task.${status}`, at: now, details: structuredClone(details) });
    if (task.events.length > 2000) task.events.splice(0, task.events.length - 2000);
    await this.#persist();
    return structuredClone(task);
  }

  async appendEvent(id, type, details = {}) {
    if (typeof type !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(type)) throw new TypeError('event type is invalid');
    if (!details || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('event details must be an object');
    if (Buffer.byteLength(JSON.stringify(details)) > 8192) throw new RangeError('event details exceed 8192 bytes');
    const task = this.tasks.get(id);
    if (!task) return null;
    const event = { id: randomUUID(), sequence: ++task.eventSequence, type, at: this.clock(), details: structuredClone(details) };
    task.events.push(event);
    if (task.events.length > 2000) task.events.splice(0, task.events.length - 2000);
    task.updatedAt = event.at;
    await this.#persist();
    return structuredClone(event);
  }

  eventsSince(id, after = 0) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const events = task.events.filter(event => event.sequence > after);
    return { taskId: id, status: task.status, events: structuredClone(events), cursor: task.eventSequence };
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

export function createTaskGateway({ dataDir, token, maxBodyBytes = 1024 * 1024, clock, runtime = null, agentService = null, chiefAgent = null, agentFactory = null, multiAgentCoordinator = null, androidBuildService = null, webBuildService = null, webBrowserVerificationService = null, voiceService = null, artifactStore = null, engineeringIssueLedger = null, conversationalCore = null, defaultModel = 'qwen3:8b', allowedOrigins = [] } = {}) {
  if (typeof token !== 'string' || token.length < 16) throw new TypeError('a gateway bearer token of at least 16 characters is required');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new RangeError('maxBodyBytes must be at least 1024');
  if (!Array.isArray(allowedOrigins) || allowedOrigins.some(origin => typeof origin !== 'string' || !isValidOrigin(origin))) throw new TypeError('allowedOrigins must be an array of exact HTTP(S) origins');
  const store = new TaskStore({ dataDir, clock });
  const repositorySeedCatalog = buildDiscoveryPlan({ maxQueries: 500 }).allRepositorySeeds;
  const repositoryCategories = new Set(repositorySeedCatalog.map(item => item.category));
  const repositoryProjectTypes = new Set(repositorySeedCatalog.flatMap(item => [item.projectType, ...(item.projectTypes ?? [])].filter(Boolean)));
  const conversations = new ConversationStore({ dataDir, clock });
  const ready = Promise.all([store.initialize(), conversations.initialize()]);
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

      if (request.method === 'GET' && url.pathname === '/api/repositories/catalog') {
        const rawLimit = url.searchParams.get('limit');
        const rawOffset = url.searchParams.get('offset');
        const limit = rawLimit === null ? 50 : Number(rawLimit);
        const offset = rawOffset === null ? 0 : Number(rawOffset);
        const category = url.searchParams.get('category');
        const projectType = url.searchParams.get('projectType');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) return send(response, 400, { error: 'limit_must_be_1_to_100' });
        if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return send(response, 400, { error: 'offset_must_be_0_to_10000' });
        if (category && !repositoryCategories.has(category)) return send(response, 400, { error: 'unknown_repository_category', categories: [...repositoryCategories].sort() });
        if (projectType && !repositoryProjectTypes.has(projectType)) return send(response, 400, { error: 'unknown_repository_project_type', projectTypes: [...repositoryProjectTypes].sort() });
        const filtered = repositorySeedCatalog.filter(item =>
          (!category || item.category === category) &&
          (!projectType || item.projectType === projectType || item.projectTypes?.includes(projectType)),
        );
        const items = filtered.slice(offset, offset + limit).map(item => ({
          ...item,
          projectType: item.projectType ?? item.projectTypes?.[0] ?? null,
          htmlUrl: `https://github.com/${item.fullName}`,
          installable: false,
          status: item.status ?? 'PENDING_REVIEW',
          clonePolicy: item.clonePolicy ?? 'ON_DEMAND',
        }));
        return send(response, 200, {
          catalogVersion: 1, total: filtered.length, offset, limit,
          nextOffset: offset + items.length < filtered.length ? offset + items.length : null,
          categories: [...repositoryCategories].sort(),
          projectTypes: [...repositoryProjectTypes].sort(), items,
        });
      }
      if (url.pathname === '/api/engineering-issues' && request.method === 'GET') {
        if (!engineeringIssueLedger) return send(response, 503, { error: 'engineering_issue_ledger_unavailable' });
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === null ? 100 : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return send(response, 400, { error: 'limit_must_be_1_to_500' });
        try {
          const issues = await engineeringIssueLedger.list({
            status: url.searchParams.get('status') ?? undefined,
            domain: url.searchParams.get('domain') ?? undefined,
            limit,
          });
          return send(response, 200, { total: issues.length, issues });
        } catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (url.pathname === '/api/engineering-issues' && request.method === 'POST') {
        if (!engineeringIssueLedger) return send(response, 503, { error: 'engineering_issue_ledger_unavailable' });
        try { return send(response, 201, await engineeringIssueLedger.create(await readJson(request, maxBodyBytes))); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }
      const engineeringIssueMatch = url.pathname.match(/^\/api\/engineering-issues\/(ZFI-[A-Za-z0-9-]{8,40})$/);
      if (engineeringIssueMatch && request.method === 'GET') {
        if (!engineeringIssueLedger) return send(response, 503, { error: 'engineering_issue_ledger_unavailable' });
        const issue = engineeringIssueLedger.get(engineeringIssueMatch[1]);
        return issue ? send(response, 200, issue) : send(response, 404, { error: 'engineering_issue_not_found' });
      }
      if (engineeringIssueMatch && request.method === 'PATCH') {
        if (!engineeringIssueLedger) return send(response, 503, { error: 'engineering_issue_ledger_unavailable' });
        try {
          const issue = await engineeringIssueLedger.update(engineeringIssueMatch[1], await readJson(request, maxBodyBytes));
          return issue ? send(response, 200, issue) : send(response, 404, { error: 'engineering_issue_not_found' });
        } catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (request.method === 'GET' && url.pathname === '/api/agents') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        return send(response, 200, { agents: await agentFactory.listAgents() });
      }
      if (request.method === 'POST' && url.pathname === '/api/agents') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try {
          const body = await readJson(request, maxBodyBytes);
          return send(response, 201, await agentFactory.proposeAgent(body));
        } catch (error) {
          return send(response, error.message.includes('already exists') ? 409 : 400, { error: error.message });
        }
      }
      const agentProfileMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})\/profile$/);
      const agentTestsMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})\/tests$/);
      const agentReviewsMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})\/reviews$/);
      const agentActivationMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})\/activate$/);
      const agentDeactivateMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})\/deactivate$/);
      const agentDetailMatch = url.pathname.match(/^\/api\/agents\/([A-Za-z0-9._-]{1,64})$/);
      if (agentProfileMatch && request.method === 'GET') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.getExecutionProfile(agentProfileMatch[1])); }
        catch (error) { return send(response, 409, { error: error.message }); }
      }
      if (agentTestsMatch && request.method === 'POST') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.recordTestResult({ ...(await readJson(request, maxBodyBytes)), agentId: agentTestsMatch[1] })); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (agentReviewsMatch && request.method === 'POST') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.recordReview({ ...(await readJson(request, maxBodyBytes)), agentId: agentReviewsMatch[1] })); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (agentActivationMatch && request.method === 'POST') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.activate({ ...(await readJson(request, maxBodyBytes)), agentId: agentActivationMatch[1] })); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (agentDeactivateMatch && request.method === 'POST') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.deactivateAgent({ ...(await readJson(request, maxBodyBytes)), agentId: agentDeactivateMatch[1] })); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }
      if (agentDetailMatch && request.method === 'GET') {
        if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
        try { return send(response, 200, await agentFactory.getAgent(agentDetailMatch[1])); }
        catch (error) { return send(response, 404, { error: error.message }); }
      }
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
      if (request.method === 'GET' && url.pathname === '/api/voice/capabilities') {
        const capabilities = voiceService?.inspectCapabilities
          ? await voiceService.inspectCapabilities()
          : voiceService?.capabilities?.() ?? { transcription: false, synthesis: false, localOnly: true };
        return send(response, 200, { capabilities });
      }
      if (request.method === 'POST' && url.pathname === '/api/voice/transcribe') {
        if (!voiceService || typeof voiceService.transcribe !== 'function') return send(response, 503, { error: 'local_transcription_unavailable' });
        try {
          const audio = await readRaw(request, voiceService.maxAudioBytes ?? 25 * 1024 * 1024);
          const result = await voiceService.transcribe({ audio, contentType: request.headers['content-type'] ?? '' });
          return send(response, 200, result);
        } catch (error) {
          return send(response, error.statusCode ?? 400, { error: error.message });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/voice/synthesize') {
        if (!voiceService || typeof voiceService.synthesize !== 'function') return send(response, 503, { error: 'local_synthesis_unavailable' });
        try {
          const body = await readJson(request, maxBodyBytes);
          const result = await voiceService.synthesize({ text: body.text, engine: body.engine ?? 'auto' });
          response.writeHead(200, {
            'Content-Type': result.contentType ?? 'audio/wav',
            'Content-Length': result.audio.length,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          return response.end(result.audio);
        } catch (error) {
          return send(response, error.statusCode ?? 400, { error: error.message });
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/models') {
        if (!agentService || typeof agentService.listModels !== 'function') return send(response, 503, { error: 'model_inventory_unavailable' });
        return send(response, 200, { models: await agentService.listModels() });
      }
      if (request.method === 'GET' && url.pathname === '/api/capabilities') {
        if (!conversationalCore || typeof conversationalCore.getCapabilities !== 'function') return send(response, 503, { error: 'conversational_core_unavailable' });
        return send(response, 200, { capabilities: conversationalCore.getCapabilities() });
      }
      if (request.method === 'POST' && url.pathname === '/api/conversation') {
        if (!conversationalCore || typeof conversationalCore.respond !== 'function') return send(response, 503, { error: 'conversational_core_unavailable' });
        try {
          const body = await readJson(request, maxBodyBytes);
          const message = body.message;
          if (typeof message !== 'string' || !message.trim() || message.length > 4000) return send(response, 400, { error: 'message_must_contain_1_to_4000_characters' });
          let conversationId = body.conversationId;
          if (conversationId !== undefined) {
            if (typeof conversationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(conversationId) || !conversations.get(conversationId)) {
              return send(response, 404, { error: 'conversation_not_found' });
            }
          } else {
            conversationId = conversations.create();
          }
          const history = (conversations.get(conversationId)?.messages ?? []).slice(-12).map(item => ({ role: item.role, content: item.content }));
          const result = await conversationalCore.respond({
            message,
            history,
            model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel,
          });
          let taskId = null;
          if (result.mode === 'plan' && result.requiresApproval === true && result.executionStarted === false) {
            const task = await store.create({
              request: message,
              metadata: { mode: 'conversational-plan', conversationId, approvedPlanSha256: result.approvedPlanSha256 },
            });
            taskId = task.id;
          }
          await conversations.append(conversationId, [
            { role: 'user', content: message },
            { role: 'assistant', content: result.reply ?? 'لم يتم إنشاء رد.' },
          ]);
          return send(response, 200, { ...result, conversationId, taskId });
        } catch (error) {
          return send(response, error.statusCode ?? 422, { error: 'conversation_failed', details: error.message });
        }
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
      const planMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/plan$/i);
      if (planMatch && request.method === 'POST') {
        if (!chiefAgent || typeof chiefAgent.planTask !== 'function') return send(response, 503, { error: 'chief_agent_planning_unavailable' });
        const task = store.get(planMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        const capabilities = Array.isArray(body.capabilities) ? body.capabilities.slice(0, 20).map(String) : [];
        const keywords = [...new Set(task.request.match(/[\p{L}\p{N}._+-]{3,}/gu) ?? [])].slice(0, 12);
        const availableAgents = agentFactory && typeof agentFactory.listAgents === 'function'
          ? await agentFactory.listAgents()
          : [];
        try {
          const planning = await chiefAgent.planTask({ request: task.request, capabilities, keywords, availableAgents });
          return send(response, 200, {
            phase: 'awaiting_approval',
            taskId: task.id,
            plan: planning,
            availableAgents: availableAgents.map(agent => ({ id: agent.id, name: agent.name, capabilities: agent.capabilities ?? [] })),
            executionStarted: false,
          });
        } catch (error) {
          return send(response, 422, { error: 'planning_failed', details: error.message });
        }
      }

      const agentMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/agent-run$/i);
      if (agentMatch && request.method === 'POST') {
        if (!agentService) return send(response, 503, { error: 'agent_execution_unavailable' });
        const task = store.get(agentMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        let planning = null;
        if (body.approvedPlan !== undefined) {
          if (typeof body.approvedPlan !== 'string' || !body.approvedPlan.trim()) {
            return send(response, 400, { error: 'approved_plan_snapshot_required' });
          }
          const actualDigest = createHash('sha256').update(body.approvedPlan).digest('hex');
          if (body.approvedPlanSha256 !== actualDigest) {
            return send(response, 409, { error: 'approved_plan_fingerprint_mismatch' });
          }
          try { planning = JSON.parse(body.approvedPlan); }
          catch { return send(response, 400, { error: 'approved_plan_snapshot_invalid_json' }); }
          if (!planning || typeof planning !== 'object' || typeof planning.plan !== 'string'
            || planning.requiresApproval !== true || planning.executionStarted !== false) {
            return send(response, 400, { error: 'approved_plan_snapshot_invalid_schema' });
          }
        }
        const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel;
        let executionProfile = null;
        if (body.agentId) {
          if (!agentFactory) return send(response, 503, { error: 'agent_factory_unavailable' });
          try { executionProfile = await agentFactory.getExecutionProfile(body.agentId); }
          catch (error) { return send(response, 409, { error: error.message }); }
        }
        await store.transition(task.id, 'running', { details: { mode: 'local-agent', model, agentId: body.agentId ?? null } });
        try {
          const capabilities = Array.isArray(body.capabilities) ? body.capabilities.slice(0, 20).map(String) : [];
          const keywords = Array.isArray(body.keywords)
            ? body.keywords.slice(0, 12).map(String)
            : [...new Set(task.request.match(/[\\p{L}\\p{N}._+-]{3,}/gu) ?? [])].slice(0, 12);
          const availableAgents = agentFactory && typeof agentFactory.listAgents === 'function'
            ? await agentFactory.listAgents()
            : [];
          if (!planning) {
            planning = chiefAgent
              ? await chiefAgent.planTask({ request: task.request, capabilities, keywords, availableAgents })
              : null;
          }
          let execution;
          if (!body.agentId && multiAgentCoordinator && Array.isArray(planning?.orchestrationTasks) && planning.orchestrationTasks.length >= 2) {
            const delegatedTasks = planning.orchestrationTasks.map((item, index) => ({
              ...item,
              workspaceId: item.workspaceId ?? `zforge-${task.id.slice(-8)}-${index + 1}`,
            }));
            const orchestration = await multiAgentCoordinator.executePlan({
              workspaceId: task.workspaceId ?? task.id,
              tasks: delegatedTasks,
              onProgress: event => store.appendEvent(task.id, event.type, event.details),
            });
            execution = {
              completed: orchestration.status === 'completed',
              status: orchestration.status,
              summary: `Specialist orchestration: ${orchestration.summary.succeeded} succeeded, ${orchestration.summary.failed} failed, ${orchestration.summary.skipped} skipped.`,
              steps: orchestration.summary.total,
              evidence: orchestration.tasks.flatMap(item => item.evidence ?? []),
              workspaceId: task.workspaceId,
              orchestration,
            };
          } else {
            execution = await agentService.runTask({
              request: task.request,
              model,
              workspaceId: task.workspaceId,
              plan: planning?.plan ?? null,
              allowedTools: executionProfile?.allowedTools ?? null,
              resourceLimits: executionProfile?.resourceLimits ?? null,
              onProgress: event => store.appendEvent(task.id, event.type, event.details),
            });
          }
          const result = { ...execution, agentProfile: executionProfile ? { agentId: executionProfile.agentId, name: executionProfile.name, version: executionProfile.version } : null, planning: planning ? {
            status: planning.status,
            discoveryStatus: planning.discoveryStatus,
            candidatesConsidered: planning.candidatesConsidered,
            proposedInternalBuilds: planning.proposedInternalBuilds,
            orchestrationStatus: planning.orchestrationStatus ?? 'NOT_PROPOSED',
            orchestrationTaskCount: planning.orchestrationTasks?.length ?? 0,
            orchestrationPlanError: planning.orchestrationPlanError ?? null,
          } : null };
          const status = result.completed === true ? 'succeeded' : result.status === 'failed' ? 'failed' : 'inconclusive';
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
      const webBuildMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/web-build$/i);
      if (webBuildMatch && request.method === 'POST') {
        if (!webBuildService) return send(response, 503, { error: 'web_build_service_unavailable' });
        const task = store.get(webBuildMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        await store.transition(task.id, 'running', { details: { mode: 'web-build', projectPath: body.projectPath ?? '.' } });
        try {
          const result = await webBuildService.build({
            workspaceId: task.workspaceId,
            projectPath: body.projectPath ?? '.',
            outputDirectory: body.outputDirectory ?? 'dist',
            runTests: body.runTests !== false,
          });
          const status = result.status === 'succeeded' ? 'succeeded' : 'failed';
          const completed = await store.transition(task.id, status, {
            result,
            error: status === 'succeeded' ? null : result.error ?? 'Web build failed',
            details: { mode: 'web-build', artifactCount: result.artifacts?.length ?? 0 },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', { error: error.message, details: { mode: 'web-build' } });
          return send(response, 200, failed);
        }
      }
      const webVerifyMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/web-verify$/i);
      if (webVerifyMatch && request.method === 'POST') {
        if (!webBrowserVerificationService) return send(response, 503, { error: 'web_browser_verification_unavailable' });
        const task = store.get(webVerifyMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        await store.transition(task.id, 'running', { details: { mode: 'web-browser-verification', projectPath: body.projectPath ?? '.' } });
        try {
          const result = await webBrowserVerificationService.verify({
            workspaceId: task.workspaceId,
            projectPath: body.projectPath ?? '.',
            outputDirectory: body.outputDirectory ?? 'dist',
            browsers: body.browsers ?? ['chromium', 'firefox', 'webkit'],
            viewportWidth: body.viewportWidth ?? 390,
            viewportHeight: body.viewportHeight ?? 844,
          });
          const status = result.status === 'passed' ? 'succeeded' : result.status === 'unavailable' ? 'inconclusive' : 'failed';
          const completed = await store.transition(task.id, status, {
            result,
            error: status === 'succeeded' ? null : result.reason ?? 'One or more browser checks failed.',
            details: { mode: 'web-browser-verification', ...result.summary },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', { error: error.message, details: { mode: 'web-browser-verification' } });
          return send(response, 200, failed);
        }
      }
      const androidBuildMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/android-build$/i);
      if (androidBuildMatch && request.method === 'POST') {
        if (!androidBuildService) return send(response, 503, { error: 'android_build_service_unavailable' });
        const task = store.get(androidBuildMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        await store.transition(task.id, 'running', { details: { mode: 'android-gradle-build', projectPath: body.projectPath ?? '.' } });
        try {
          const result = await androidBuildService.build({
            workspaceId: task.workspaceId,
            projectPath: body.projectPath ?? '.',
            variant: body.variant ?? 'debug',
            formats: body.formats ?? ['apk'],
            runTests: body.runTests !== false,
          });
          const status = result.status === 'succeeded' ? 'succeeded' : 'failed';
          const completed = await store.transition(task.id, status, {
            result,
            error: status === 'succeeded' ? null : result.error ?? 'Android build failed',
            details: { mode: 'android-gradle-build', artifactCount: result.artifacts?.length ?? 0 },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', { error: error.message, details: { mode: 'android-gradle-build' } });
          return send(response, 200, failed);
        }
      }
      const orchestrationMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/orchestrate$/i);
      if (orchestrationMatch && request.method === 'POST') {
        if (!multiAgentCoordinator) return send(response, 503, { error: 'multi_agent_orchestration_unavailable' });
        const task = store.get(orchestrationMatch[1]);
        if (!task) return send(response, 404, { error: 'task_not_found' });
        const body = await readJson(request, maxBodyBytes);
        if (body.confirmExecution !== true) return send(response, 409, { error: 'explicit_execution_confirmation_required' });
        await store.transition(task.id, 'running', { details: { mode: 'multi-agent-orchestration', taskCount: Array.isArray(body.tasks) ? body.tasks.length : 0 } });
        try {
          const result = await multiAgentCoordinator.executePlan({ workspaceId: task.workspaceId, tasks: body.tasks, onProgress: event => store.appendEvent(task.id, event.type, event.details) });
          const status = result.status === 'completed' ? 'succeeded' : result.status === 'partial' ? 'inconclusive' : 'failed';
          const completed = await store.transition(task.id, status, {
            result,
            error: status === 'succeeded' ? null : 'one or more delegated tasks did not complete successfully',
            details: { mode: 'multi-agent-orchestration', ...result.summary },
          });
          return send(response, 200, completed);
        } catch (error) {
          const failed = await store.transition(task.id, 'failed', { error: error.message, details: { mode: 'multi-agent-orchestration' } });
          return send(response, 200, failed);
        }
      }
      const eventsMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/events$/i);
      if (eventsMatch && request.method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) return send(response, 400, { error: 'invalid_event_cursor' });
        const result = store.eventsSince(eventsMatch[1], after);
        return result ? send(response, 200, result) : send(response, 404, { error: 'task_not_found' });
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
  return { server, store, conversations, ready };
}
