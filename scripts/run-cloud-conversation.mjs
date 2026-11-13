import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCloudTaskPhase, normalizeCloudTaskRequest } from '../src/core/cloud-task-contract.js';

const outputDir = process.env.ZFORGE_CLOUD_OUTPUT_DIR ?? join(tmpdir(), 'zforge-cloud-output');
const resultPath = join(outputDir, 'cloud-task-result.json');
const eventPath = process.env.GITHUB_EVENT_PATH;
const model = process.env.ZFORGE_MODEL ?? 'qwen2.5:1.5b';
const port = '8787';
let server;
let logs = '';

async function saveReport(report) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(resultPath, JSON.stringify(report, null, 2));
}

async function waitForGateway(baseUrl, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) throw new Error('ZForge runtime exited before becoming healthy. ' + logs.slice(-2500));
    try {
      const response = await fetch(baseUrl + '/api/health', { signal: AbortSignal.timeout(2500) });
      const payload = await response.json();
      if (response.ok && payload.status === 'ok') return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('ZForge runtime health check timed out. ' + logs.slice(-2500));
}

async function api(baseUrl, token, path, { method = 'GET', body, timeoutMs = 8 * 60 * 1000 } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload.details ? ': ' + String(payload.details).slice(0, 1200) : '';
    throw new Error((payload.error || ('ZForge API returned HTTP ' + response.status)) + details);
  }
  return payload;
}

try {
  if (!eventPath) throw new Error('GitHub issue event payload is unavailable.');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const { phase } = getCloudTaskPhase({ action: event.action, issue: event.issue, comment: event.comment });
  if (phase !== 'plan') throw new Error('The conversation worker accepts issue-opened events only.');
  const { request } = normalizeCloudTaskRequest({
    author: event.issue?.user?.login,
    title: event.issue?.title,
    body: event.issue?.body,
  });

  await mkdir(outputDir, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const baseUrl = 'http://127.0.0.1:' + port;
  const runtimeEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? tmpdir(),
    TMPDIR: process.env.RUNNER_TEMP ?? tmpdir(),
    LANG: 'C.UTF-8',
    ZFORGE_GATEWAY_TOKEN: token,
    ZFORGE_HOST: '127.0.0.1',
    ZFORGE_PORT: port,
    ZFORGE_DATA_DIR: join(outputDir, 'data'),
    ZFORGE_WORKSPACE_DIR: join(outputDir, 'workspaces'),
    ZFORGE_ARTIFACT_DIR: join(outputDir, 'artifacts'),
    ZFORGE_REPO_ROOT: process.cwd(),
    ZFORGE_MODEL: model,
    ZFORGE_EXECUTION_BACKEND: 'local',
    ZFORGE_AGENT_MAX_STEPS: '12',
    ZFORGE_MAX_PARALLEL_AGENTS: '1',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  };

  server = spawn(process.execPath, ['src/runtime/server.js'], {
    cwd: process.cwd(),
    env: runtimeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { logs = (logs + chunk.toString()).slice(-10000); });
  server.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-10000); });
  await waitForGateway(baseUrl);

  const inventory = await api(baseUrl, token, '/api/models');
  if (!Array.isArray(inventory.models) || !inventory.models.includes(model)) {
    throw new Error('Required local model is unavailable: ' + model);
  }

  const result = await api(baseUrl, token, '/api/conversation', {
    method: 'POST',
    body: { message: request, model },
  });
  const report = {
    status: result.mode === 'plan' ? 'awaiting_approval' : 'completed',
    phase: 'conversation',
    taskId: result.taskId ?? null,
    model,
    reply: String(result.reply ?? '').slice(0, 9000),
    summary: result.mode === 'plan' ? 'تم إعداد خطة تنتظر موافقتك. لم يبدأ التنفيذ.' : 'أجاب BLACK VANTA عن الرسالة دون بدء تنفيذ.',
    plan: result.planning ?? null,
    planSha256: result.planning ? createHash('sha256').update(JSON.stringify(result.planning)).digest('hex') : null,
    executionStarted: result.executionStarted === true,
    diagnosticCode: result.diagnosticCode ?? null,
    generatedAt: new Date().toISOString(),
  };
  if (report.status === 'awaiting_approval' && (!report.plan || !report.taskId || result.executionStarted !== false)) {
    throw new Error('The conversational planning response violated the approval-only contract.');
  }
  await saveReport(report);
  if (report.diagnosticCode || !report.reply) process.exitCode = 1;
} catch (error) {
  await saveReport({
    status: 'failed',
    summary: '',
    reply: 'تعذر إكمال الطلب على العامل السحابي. لم يبدأ أي تنفيذ. التفاصيل: ' + String(error?.message ?? error).slice(0, 1200),
    error: String(error?.message ?? error).slice(0, 3000),
    runtimeLogs: logs.slice(-4000),
    generatedAt: new Date().toISOString(),
  });
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}
