import { GitHubApiClient } from './github-api-client.js';
import { inspectZeroCostDependencies } from '../core/discovery-engine.js';
import { ApiBudgetExceededError } from '../core/global-api-budget.js';

const LICENSE_NAMES = new Set(['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']);
const MANIFEST_NAMES = new Set(['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'requirements.txt', 'build.gradle', 'build.gradle.kts']);
const ENV_NAMES = new Set(['.env.example', '.env.sample', '.env.template']);
const SECURITY_NAMES = new Set(['SECURITY.md']);

export class GitHubInspectionError extends Error {
  constructor(message, { status = 0 } = {}) {
    super(message);
    this.name = 'GitHubInspectionError';
    this.status = status;
  }
}

function decodeContent(value) {
  if (typeof value !== 'string') return null;
  try {
    const binary = globalThis.atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export class GitHubRepositoryInspector {
  constructor({ token = null, apiClient = null, budget = null, maxFiles = 12 } = {}) {
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 12) throw new RangeError('maxFiles must be 1..12');
    this.apiClient = apiClient ?? new GitHubApiClient({ token, ...(budget ? { budget } : {}) });
    this.maxFiles = maxFiles;
  }

  async request(route, parameters = {}) {
    const snapshot = this.apiClient.budget?.snapshot?.();
    if (snapshot && snapshot.remainingBudget <= 0) throw new ApiBudgetExceededError('Global GitHub API request budget exhausted before repository inspection.', snapshot);
    console.log(`[INSPECT] GET ${route} — budget remaining before request: ${snapshot?.remainingBudget ?? 'untracked'}`);
    try {
      const response = await this.apiClient.request(route, parameters, { resource: 'core' });
      const after = this.apiClient.budget?.snapshot?.();
      console.log(`[INSPECT] GET ${route} — completed; budget used=${after?.used ?? 'untracked'}, remaining=${after?.remainingBudget ?? 'untracked'}`);
      return response;
    } catch (error) {
      if (error.status === 404) {
        console.log(`[INSPECT] GET ${route} — not found (404)`);
        return null;
      }
      if (error instanceof ApiBudgetExceededError || error.name === 'ApiBudgetExceededError') throw error;
      throw new GitHubInspectionError(error.message, { status: error.status ?? 0 });
    }
  }

  async inspectRepository(fullName) {
    if (typeof fullName !== 'string' || !/^[-\w.]+\/[-\w.]+$/.test(fullName)) throw new TypeError('fullName must be owner/repository');
    const [owner, repo] = fullName.split('/');
    const metadataResponse = await this.request('GET /repos/{owner}/{repo}', { owner, repo });
    if (!metadataResponse) throw new GitHubInspectionError('Repository not found.', { status: 404 });
    const metadata = metadataResponse.data;
    console.log(`[INSPECT] ${fullName} — repository metadata loaded; fork=${metadata.fork === true}`);
    const rootResponse = await this.request('GET /repos/{owner}/{repo}/contents', { owner, repo });
    const root = Array.isArray(rootResponse?.data) ? rootResponse.data : [];
    const available = new Map(root.filter(item => item.type === 'file').map(item => [item.name, item]));
    const priority = [
      'README.md', '.env.example', 'package.json', 'pyproject.toml', 'requirements.txt',
      'Cargo.toml', 'go.mod', 'build.gradle', 'build.gradle.kts', 'openapi.yaml',
      'openapi.json', 'swagger.yaml', 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING',
      'SECURITY.md', 'Dockerfile',
    ];
    const selected = [...new Set(priority)].filter(name => available.has(name)).slice(0, this.maxFiles);
    const inspected = [];
    let inspectionComplete = true;
    for (const name of selected) {
      const remaining = this.apiClient.budget?.snapshot?.().remainingBudget;
      if (Number.isFinite(remaining) && remaining <= 0) {
        inspectionComplete = false;
        console.log(`[INSPECT] ${fullName} — stopped before ${name}: global API budget exhausted`);
        break;
      }
      const item = available.get(name);
      const fileResponse = await this.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path: name });
      const file = fileResponse?.data;
      if (!file || file.encoding !== 'base64' || !file.content) {
        console.log(`[INSPECT] ${fullName} — ${name}: file unavailable or unsupported encoding`);
        continue;
      }
      inspected.push({ name, path: file.path ?? name, size: file.size ?? item.size ?? null, content: decodeContent(file.content) });
      console.log(`[INSPECT] ${fullName} — inspected ${name}`);
    }
    const licenseFiles = inspected.filter(file => LICENSE_NAMES.has(file.name));
    const manifests = inspected.filter(file => MANIFEST_NAMES.has(file.name) || ENV_NAMES.has(file.name))
      .map(file => ({ name: file.name, content: file.content }));
    const securityFiles = inspected.filter(file => SECURITY_NAMES.has(file.name));
    const zeroCostAssessment = inspectZeroCostDependencies(manifests);
    const readme = inspected.find(file => file.name === 'README.md');
    const evidenceSnippet = readme?.content?.split(/\\r?\\n/).map(line => line.trim()).find(line => line && !line.startsWith('![') && !line.startsWith('[!')) ?? null;
    const rootNames = new Set(root.map(item => item.name));
    const structuralEvidence = {
      readme: rootNames.has('README.md'),
      testsDirectory: root.some(item => ['tests', 'test'].includes(item.name) && item.type === 'dir'),
      apiDocumentation: ['openapi.yaml', 'openapi.json', 'swagger.yaml', 'docs'].some(name => rootNames.has(name)),
      configurationManifest: [...MANIFEST_NAMES].some(name => rootNames.has(name)),
    };
    const mentions = new Set();
    for (const file of manifests) {
      const content = file.content ?? '';
      for (const marker of ['openai', 'anthropic', 'claude', 'gemini', 'vercel', 'netlify', 'cloudflare', 'firebase', 'supabase', 'stripe']) {
        if (new RegExp(marker, 'i').test(content)) mentions.add(marker);
      }
    }
    return {
      repository: {
        id: metadata.id, name: metadata.name, fullName: metadata.full_name, htmlUrl: metadata.html_url,
        archived: metadata.archived, fork: metadata.fork === true, parentFullName: metadata.parent?.full_name ?? null,
        defaultBranch: metadata.default_branch, pushedAt: metadata.pushed_at,
        license: metadata.license ? { spdxId: metadata.license.spdx_id, name: metadata.license.name } : null,
      },
      rootFilesInspected: inspected.map(file => file.name),
      structuralEvidence,
      licenseFiles: licenseFiles.map(file => ({ name: file.name, content: file.content })),
      dependencyManifests: manifests,
      securityFiles: securityFiles.map(file => ({ name: file.name, content: file.content })),
      externalServiceMentions: [...mentions],
      zeroCostAssessment,
      inspectionComplete,
      evidence: readme && evidenceSnippet ? { sourcePath: readme.path, snippet: evidenceSnippet.slice(0, 240), url: `https://github.com/${fullName}/blob/${metadata.default_branch}/${readme.path}` } : null,
      inspectionStatus: !structuralEvidence.readme || (!structuralEvidence.testsDirectory && !structuralEvidence.apiDocumentation && !structuralEvidence.configurationManifest)
        ? 'REJECTED_STRUCTURAL_EVIDENCE'
        : zeroCostAssessment.status === 'REJECTED_PAID_REQUIREMENT' ? 'REJECTED_PAID_REQUIREMENT' : 'NEEDS_DEPENDENCY_AND_LICENSE_REVIEW',
      notes: [
        'Repository metadata license is not a substitute for reading the full license text.',
        'External-service mentions are indicators only; inspect whether each dependency is required, optional, self-hostable or paid.',
        'Model weights, datasets, fonts and bundled assets may have separate licenses.',
        'No repository code or install script was executed.',
      ],
      inspectedAt: new Date().toISOString(),
    };
  }
}
