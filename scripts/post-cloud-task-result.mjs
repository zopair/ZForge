import { readFile } from 'node:fs/promises';

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const runUrl = process.env.GITHUB_RUN_ID
  ? 'https://github.com/' + repository + '/actions/runs/' + process.env.GITHUB_RUN_ID
  : '';
if (!repository || !token || !Number.isInteger(event.issue?.number)) {
  throw new Error('Issue comment credentials or event metadata are missing.');
}

let report = { status: 'failed', error: 'The cloud worker did not produce a result report.' };
try {
  report = JSON.parse(await readFile(process.env.ZFORGE_CLOUD_RESULT_FILE, 'utf8'));
} catch {}

const lines = [
  '## ZForge Cloud Execution',
  '',
  '**Status:** ' + String(report.status ?? 'unknown').toUpperCase(),
  report.status === 'awaiting_approval' ? '**Execution:** NOT STARTED — awaiting explicit owner approval.' : '',
  report.summary ? '**Result:** ' + String(report.summary).slice(0, 3000) : '',
  report.error ? '**Details:** ' + String(report.error).slice(0, 2500) : '',
  report.status === 'awaiting_approval' && report.plan ? '**Proposed plan:**\\n```json\\n' + JSON.stringify(report.plan, null, 2).slice(0, 9000) + '\\n```' : '',
  report.status === 'awaiting_approval' ? '**Plan SHA-256:** `' + String(report.planSha256 ?? '') + '`' : '',
  report.status === 'awaiting_approval' ? 'To approve this exact plan, comment: `/approve-plan ' + String(report.planSha256 ?? '') + '`' : '',
  Number.isInteger(report.steps) ? '**Agent steps:** ' + report.steps : '',
  '**Model:** ' + String(report.model ?? 'qwen2.5:1.5b'),
  runUrl ? '[Open cloud worker run and download artifacts](' + runUrl + ')' : '',
  '',
  '_This worker ran on an ephemeral GitHub Actions runner. No phone-side runtime or installation was used._',
].filter(Boolean);

const response = await fetch('https://api.github.com/repos/' + repository + '/issues/' + event.issue.number + '/comments', {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ body: lines.join('\n') }),
});
if (!response.ok) {
  throw new Error('Unable to publish cloud task result comment: HTTP ' + response.status + ' ' + (await response.text()).slice(0, 1000));
}
