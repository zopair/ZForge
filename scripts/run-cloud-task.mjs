import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, cp, lstat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeCloudTaskRequest, getCloudTaskPhase } from '../src/core/cloud-task-contract.js';

const outputDir = process.env.ZFORGE_CLOUD_OUTPUT_DIR ?? join(tmpdir(), 'zforge-cloud-output');
const resultPath = join(outputDir, 'cloud-task-result.json');
const eventPath = process.env.GITHUB_EVENT_PATH;
const port = '8787';
const model = 'qwen2.5:1.5b';
let server;
let logs = '';
let taskWorkspacePath = null;

async function saveReport(report) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(resultPath, JSON.stringify(report, null, 2));
}

async function waitForGateway(child, baseUrl, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error('ZForge runtime exited before becoming healthy. ' + logs.slice(-3000));
    try {
      const response = await fetch(baseUrl + '/api/health', { signal: AbortSignal.timeout(2500) });
      const payload = await response.json();
      if (response.ok && payload.status === 'ok') return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('ZForge runtime health check timed out. ' + logs.slice(-3000));
}

async function api(baseUrl, token, path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || ('ZForge API returned HTTP ' + response.status));
  return payload;
}

try {
  if (!eventPath) throw new Error('GitHub issue event payload is unavailable.');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const { phase } = getCloudTaskPhase({ action: event.action, issue: event.issue, comment: event.comment });
  const { request } = normalizeCloudTaskRequest({
    author: event.issue?.user?.login,
    title: event.issue?.title,
    body: event.issue?.body,
  });
  await mkdir(outputDir, { recursive: true });
  const dataDir = join(outputDir, 'data');
  const workspaceDir = join(outputDir, 'workspaces');
  const artifactDir = join(outputDir, 'artifacts');
  const token = randomBytes(32).toString('hex');
  const baseUrl = 'http://127.0.0.1:' + port;

  // Deliberately pass an allowlisted environment: no GITHUB_TOKEN, Actions runtime
  // credentials, repository write credentials, or unrelated runner secrets reach
  // the model or commands executed by its workspace tools.
  const runtimeEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? tmpdir(),
    TMPDIR: process.env.RUNNER_TEMP ?? tmpdir(),
    LANG: 'C.UTF-8',
    ZFORGE_GATEWAY_TOKEN: token,
    ZFORGE_HOST: '127.0.0.1',
    ZFORGE_PORT: port,
    ZFORGE_DATA_DIR: dataDir,
    ZFORGE_WORKSPACE_DIR: workspaceDir,
    ZFORGE_ARTIFACT_DIR: artifactDir,
    ZFORGE_REPO_ROOT: process.cwd(),
    ZFORGE_MODEL: model,
    ZFORGE_EXECUTION_BACKEND: 'container',
    ZFORGE_CONTAINER_ENGINE: 'docker',
    ZFORGE_CONTAINER_IMAGE: 'zforge-cloud-worker:latest',
    ZFORGE_CONTAINER_NETWORK: 'bridge',
    ZFORGE_CONTAINER_CPUS: '2',
    ZFORGE_CONTAINER_MEMORY: '4g',
    ZFORGE_CONTAINER_PIDS: '256',
    ZFORGE_CONTAINER_TMPFS: '1g',
    ANDROID_HOME: '/opt/android-sdk-linux',
    ANDROID_SDK_ROOT: '/opt/android-sdk-linux',
    JAVA_HOME: '/usr/lib/jvm/java-21-openjdk-amd64',
    ZFORGE_AGENT_MAX_STEPS: '12',
    ZFORGE_MAX_PARALLEL_AGENTS: '1',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  };

  server = spawn(process.execPath, ['src/runtime/server.js'], {
    cwd: process.cwd(),
    env: runtimeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12000); });
  server.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12000); });
  await waitForGateway(server, baseUrl);

  const inventory = await api(baseUrl, token, '/api/models');
  if (!Array.isArray(inventory.models) || !inventory.models.includes(model)) {
    throw new Error('Required local model is not available in the cloud worker: ' + model);
  }

  const task = await api(baseUrl, token, '/api/tasks', {
    method: 'POST',
    body: { request },
  });
  taskWorkspacePath = join(workspaceDir, task.workspaceId);
  await mkdir(taskWorkspacePath, { recursive: true });
  await cp(process.cwd(), taskWorkspacePath, {
    recursive: true,
    filter: async source => {
      const relativePath = relative(process.cwd(), source);
      if (relativePath) {
        const segments = relativePath.split(sep);
        if (segments.some(segment => ['.git', 'node_modules', '.zforge-data', '.zforge-workspaces', '.zforge-artifacts', 'coverage', 'test-results', 'playwright-report'].includes(segment))) return false;
      }
      const info = await lstat(source);
      return !info.isSymbolicLink();
    },
  });
  const planning = await api(baseUrl, token, '/api/tasks/' + encodeURIComponent(task.id) + '/plan', {
    method: 'POST',
    body: { model },
    timeoutMs: 8 * 60 * 1000,
  });
  if (planning.executionStarted !== false || planning.phase !== 'awaiting_approval') {
    throw new Error('Planning endpoint violated the no-execution contract.');
  }
  const planSha256 = createHash('sha256').update(JSON.stringify(planning.plan)).digest('hex');
  if (phase === 'execute' && event.comment.body.trim() !== '/approve-plan ' + planSha256) {
    throw new Error('Approval does not match the current plan digest. Review the latest plan and approve its exact SHA-256.');
  }
  if (phase === 'plan') {
    await saveReport({
      status: 'awaiting_approval',
      phase,
      taskId: task.id,
      model,
      summary: 'تم تحليل الطلب وإعداد خطة مبدئية. لم يبدأ أي تنفيذ.',
      plan: planning.plan,
      availableAgents: planning.availableAgents,
      executionStarted: false,
      planSha256,
      approvalCommand: '/approve-plan ' + planSha256,
      generatedAt: new Date().toISOString(),
    });
  } else {
  const completed = await api(baseUrl, token, '/api/tasks/' + encodeURIComponent(task.id) + '/agent-run', {
    method: 'POST',
    body: { model, confirmExecution: true, approvedPlan: JSON.stringify(planning.plan) },
    timeoutMs: 24 * 60 * 1000,
  });
  const result = completed.result ?? {};
  let workspaceArchive = null;
  try {
    workspaceArchive = join(outputDir, 'workspace-snapshot.tar.gz');
    execFileSync('tar', ['--exclude=.git', '--exclude=node_modules', '--exclude=.tmp', '-czf', workspaceArchive, '-C', taskWorkspacePath, '.'], { stdio: 'pipe', timeout: 120000 });
  } catch (archiveError) {
    workspaceArchive = null;
    logs = (logs + '\\nWorkspace archive failed: ' + archiveError.message).slice(-12000);
  }
  const report = {
    status: completed.status,
    taskId: task.id,
    model,
    workspaceArchive: workspaceArchive ? 'workspace-snapshot.tar.gz' : null,
    summary: String(result.summary ?? result.message ?? '').slice(0, 4000),
    error: String(completed.error ?? result.error ?? '').slice(0, 3000),
    steps: Number.isInteger(result.steps) ? result.steps : 0,
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 20).map(item => ({
      type: item.type ?? null,
      summary: String(item.summary ?? item.description ?? '').slice(0, 500),
      exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null,
      artifact: item.artifact ? {
        id: item.artifact.id,
        filename: item.artifact.filename,
        kind: item.artifact.kind,
        sha256: item.artifact.sha256,
        sizeBytes: item.artifact.sizeBytes,
      } : null,
    })) : [],
    generatedAt: new Date().toISOString(),
  };
  await saveReport(report);
  if (completed.status !== 'succeeded' || result.completed !== true) process.exitCode = 1;
  }
} catch (error) {
  let workspaceArchive = null;
  if (taskWorkspacePath) {
    try {
      workspaceArchive = join(outputDir, 'workspace-snapshot.tar.gz');
      execFileSync('tar', ['--exclude=.git', '--exclude=node_modules', '--exclude=.tmp', '-czf', workspaceArchive, '-C', taskWorkspacePath, '.'], { stdio: 'pipe', timeout: 120000 });
    } catch {}
  }
  await saveReport({
    status: 'failed',
    summary: '',
    workspaceArchive: workspaceArchive ? 'workspace-snapshot.tar.gz' : null,
    error: String(error?.message ?? error).slice(0, 5000),
    runtimeLogs: logs.slice(-5000),
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
  const artifactSource = join(outputDir, 'artifacts');
  try { await cp(artifactSource, join(outputDir, 'artifact-files'), { recursive: true, force: true }); } catch {}
}
