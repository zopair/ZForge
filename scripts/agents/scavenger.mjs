import { readFile, writeFile } from 'node:fs/promises';
import { GitHubDiscoveryClient } from '../../src/adapters/github-discovery.js';
import { createResourcePolicy } from './resource-manager.mjs';

const CATALOG = 'tools_catalog.md';
const QUERIES = [
  'topic:public-api archived:false',
  'topic:open-source-tools archived:false',
];

function safe(value = '') {
  return String(value).replace(/[|\n\r]/g, ' ').trim();
}

export async function runScavenger({ fetchImpl = fetch, catalogPath = CATALOG } = {}) {
  const policy = createResourcePolicy({ maxRequests: 4, maxRetries: 0 });
  const client = new GitHubDiscoveryClient({
    fetchImpl: (url, options) => policy.run(() => fetchImpl(url, options)),
    perPage: 10,
    maxPages: 1,
  });
  let current = '';
  try { current = await readFile(catalogPath, 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const known = new Set([...current.matchAll(/github\.com\/([^\s|)]+)/g)].map(match => match[1].toLowerCase()));
  const rows = [];
  for (const query of QUERIES) {
    if (policy.remaining === 0) break;
    const result = await client.searchRepositories(query, { maxResults: 10 });
    for (const repo of result.results) {
      const key = safe(repo.fullName).toLowerCase();
      if (!key || known.has(key)) continue;
      known.add(key);
      rows.push(`| GitHub | https://github.com/${key} | ${safe(repo.description) || 'No description'} | ${safe(repo.license?.spdxId) || 'unknown'} | review-required | ${new Date().toISOString().slice(0, 10)} |`);
    }
  }
  if (!current) current = '# ZForge Tools Catalog\n\nDiscovery candidates only. Verify the full license text, dependency licenses, security posture, maintenance and zero-cost terms before adoption.\n\n| Source | URL | Description | SPDX hint | Review status | Discovered |\n|---|---|---|---|---|---|\n';
  if (rows.length) await writeFile(catalogPath, current.trimEnd() + '\n' + rows.join('\n') + '\n');
  return { added: rows.length, requests: policy.requests, remaining: policy.remaining };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScavenger().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
