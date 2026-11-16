function clean(value) {
  return String(value ?? 'Not verified').replace(/[\r\n]+/g, ' ').trim();
}

export function assessIntegrationFeasibility({ architecture = 'unknown', runtime = 'unknown', dependencies = [] } = {}) {
  const serverless = /serverless|edge|lambda|worker/i.test(architecture);
  const client = /browser|client|wasm|web/i.test(architecture);
  const local = /local|self-host|offline|wasm/i.test(runtime);
  const blocked = dependencies.some(item => /secret|paid|commercial|hosted-only/i.test(String(item)));
  const score = blocked ? 'LOW' : serverless && local ? 'HIGH' : client || serverless ? 'MEDIUM' : 'LOW';
  return { score, target: serverless ? 'serverless' : client ? 'client-side' : 'server-side review', rationale: blocked ? 'Commercial credential or hosted-only dependency detected.' : local ? 'Evidence indicates a local/self-hosted execution path.' : 'Architecture evidence is insufficient for a stronger conclusion.' };
}

export function renderCatalogEntry(candidate) {
  if (!candidate || !candidate.name || !candidate.repoUrl || !candidate.evidence) throw new TypeError('name, repoUrl and verification evidence are required');
  const evidence = candidate.evidence;
  if (!evidence.sourcePath || !evidence.snippet) throw new TypeError('evidence must include sourcePath and a verifiable snippet');
  const feasibility = candidate.integrationFeasibility ?? assessIntegrationFeasibility(candidate.architecture);
  return [
    `### ${clean(candidate.date)} — ${clean(candidate.name)}`,
    '',
    `- Tool: ${clean(candidate.name)}`,
    `- Exact repository: ${clean(candidate.repoUrl)}`,
    `- Capability: ${clean(candidate.capability)}`,
    `- Verification evidence: ${clean(evidence.sourcePath)} — \`${clean(evidence.snippet)}\``,
    `- Evidence URL: ${clean(evidence.url)}`,
    `- Integration feasibility: ${feasibility.score} (${clean(feasibility.target)}) — ${clean(feasibility.rationale)}`,
    `- License: ${clean(candidate.license)}`,
    `- Cost assessment: ${clean(candidate.costAssessment)}`,
    `- Status: ${clean(candidate.status ?? 'HUMAN_REVIEW_REQUIRED')}`,
    ''
  ].join('\\n');
}

export function renderDailyBrief({ generatedAt = new Date().toISOString(), discoveries = [], apiRequests = 0, apiRequestBudget = 50, dryRun = false } = {}) {
  const lines = [
    '# Daily Research Brief',
    '',
    `- Generated: ${clean(generatedAt)}`,
    `- Mode: ${dryRun ? 'DRY-RUN (mocked; no external API calls)' : 'RESEARCH'}`,
    `- API requests: ${apiRequests}/${apiRequestBudget}`,
    '',
    '## Discoveries',
    ''
  ];
  if (!discoveries.length) lines.push('- No discoveries passed the evidence pipeline.');
  for (const item of discoveries) lines.push(`- ${clean(item.name)} — ${clean(item.status)} — ${clean(item.repoUrl)}`);
  lines.push('', '## Verification policy', '', '- Every entry requires an exact repository URL and source-path evidence.', '- Unverifiable, duplicate, inactive, structurally weak, or commercially dependent candidates are rejected or quarantined.', '- Integration feasibility is an assessment, not proof of runtime compatibility.', '');
  return lines.join('\\n');
}
