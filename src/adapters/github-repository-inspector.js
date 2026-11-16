import { GitHubApiClient } from './github-api-client.js';
import { inspectZeroCostDependencies } from '../core/discovery-engine.js';

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
    try {
      return await this.apiClient.request(route, parameters, { resource: 'core' });
    } catch (error) {
      if (error.status === 404) return null;
      throw new GitHubInspectionError(error.message, { status: error.status ?? 0 });
    }
  }

  async inspectRepository(fullName) {
    if (typeof fullName !== 'string' || !/^[-\w.]+\/[-\w.]+$/.test(fullName)) throw new TypeError('fullName must be owner/repository');
    const [owner, repo] = fullName.split('/');
    const metadataResponse = await this.request('GET /repos/{owner}/{repo}', { owner, repo });
    if (!metadataResponse) throw new GitHubInspectionError('Repository not found.', { status: 404 });
    const metadata = metadataResponse.data;
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
    for (const name of selected) {
      const item = available.get(name);
      const fileResponse = await this.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path: name });
      const file = fileResponse?.data;
      if (!file || file.encoding !== 'base64' || !file.content) continue;
      inspected.push({ name, path: file.path ?? name, size: file.size ?? item.size ?? null, content: decodeContent(file.content) });
    }
    const licenseFiles = inspected.filter(file => LICENSE_NAMES.has(file.name));
    const manifests = inspected.filter(file => MANIFEST_NAMES.has(file.name) || ENV_NAMES.has(file.name))
      .map(file => ({ name: file.name, content: file.content }));
    const securityFiles = inspected.filter(file => SECURITY_NAMES.has(file.name));
    const zeroCostAssessment = inspectZeroCostDependencies(manifests);
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
        id: metadata.id, fullName: metadata.full_name, htmlUrl: metadata.html_url,
        archived: metadata.archived, defaultBranch: metadata.default_branch, pushedAt: metadata.pushed_at,
        license: metadata.license ? { spdxId: metadata.license.spdx_id, name: metadata.license.name } : null,
      },
      rootFilesInspected: inspected.map(file => file.name),
      structuralEvidence,
      licenseFiles: licenseFiles.map(file => ({ name: file.name, content: file.content })),
      dependencyManifests: manifests,
      securityFiles: securityFiles.map(file => ({ name: file.name, content: file.content })),
      externalServiceMentions: [...mentions],
      zeroCostAssessment,
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
