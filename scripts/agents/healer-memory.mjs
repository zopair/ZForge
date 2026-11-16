import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function redact(value) {
  return String(value)
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(api[_-]?key|secret|password)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]');
}

export async function recordIncident({ eventPath = process.env.GITHUB_EVENT_PATH, logs = '', outputDir = 'memory_logs' } = {}) {
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const run = event.workflow_run ?? {};
  if (!logs && process.env.ZFORGE_LOG_FILE) logs = await readFile(process.env.ZFORGE_LOG_FILE, 'utf8');
  const incident = {
    workflow: run.name ?? 'unknown',
    runId: run.id ?? null,
    conclusion: run.conclusion ?? 'unknown',
    headSha: run.head_sha ?? null,
    createdAt: run.created_at ?? new Date().toISOString(),
    diagnosisInput: redact(logs).slice(0, 12000),
    action: 'diagnostic-only; human review required; no source changes or commits',
  };
  await mkdir(outputDir, { recursive: true });
  const filename = `incident-${incident.runId ?? Date.now()}.json`;
  await writeFile(path.join(outputDir, filename), JSON.stringify(incident, null, 2) + '\n', { flag: 'wx' });
  return { filename, conclusion: incident.conclusion, sourcePatched: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  recordIncident().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
