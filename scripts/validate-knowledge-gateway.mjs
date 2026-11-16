import { writeFile } from 'node:fs/promises';
import { KnowledgeGateway } from '../src/adapters/knowledge-gateway.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

const metadataUrl = 'https://searx.space/data/instances.json';
const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
if (!metadataResponse.ok) throw new Error(`SearXNG instance metadata returned HTTP ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const instances = metadata.instances ?? metadata;

// searx.space currently publishes network_type, http and timing.search.
// It does not publish a has_api or timing.api field. Verify JSON API support
// with a bounded live preflight probe and derive those two values empirically.
const candidates = Object.entries(instances).flatMap(([key, item]) => {
  const url = item?.url ?? item?.http?.url ?? key;
  const searchTiming = item?.timing?.search;
  const responseTime = Number(searchTiming?.all?.value ?? searchTiming?.all?.mean ?? searchTiming?.all?.median);
  const success = Number(searchTiming?.success_percentage ?? 0);
  const healthy = item?.network_type === 'normal'
    && item?.http?.status_code === 200
    && !item?.error
    && success >= 80
    && Number.isFinite(responseTime) && responseTime > 0 && responseTime <= 5;
  if (!healthy) return [];
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return [];
    return [{ url: parsed.origin, responseTime, success }];
  } catch { return []; }
}).sort((a, b) => a.responseTime - b.responseTime);
console.log(`[SEARXNG] metadata_instances=${Object.keys(instances).length}; healthy_normal_candidates=${candidates.length}`);

let selected = null;
for (const candidate of candidates.slice(0, 20)) {
  const endpoint = new URL('/search', candidate.url);
  endpoint.searchParams.set('q', 'ZForge API capability preflight');
  endpoint.searchParams.set('format', 'json');
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        'user-agent': 'ZForge-KnowledgeGateway/1.0 (+https://github.com/zopair/ZForge)',
      },
    });
    const elapsed = (performance.now() - started) / 1000;
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.toLowerCase().includes('application/json')) {
      console.log(`[SEARXNG] API probe rejected ${candidate.url}: HTTP ${response.status}; content-type=${contentType}`);
      continue;
    }
    const payload = await response.json();
    if (!Array.isArray(payload.results)) {
      console.log(`[SEARXNG] API probe rejected ${candidate.url}: missing results array`);
      continue;
    }
    if (elapsed > 5) {
      console.log(`[SEARXNG] API probe rejected ${candidate.url}: response ${elapsed.toFixed(3)}s exceeds 5s`);
      continue;
    }
    selected = { ...candidate, hasApi: true, apiResponse: elapsed };
    break;
  } catch (error) {
    console.log(`[SEARXNG] API probe failed ${candidate.url}: ${error.name}`);
  }
}
if (!selected) throw new Error('No healthy normal-network SearXNG instance empirically exposed a responsive JSON API in the bounded preflight (maximum 20 candidates).');

process.env.ZFORGE_SEARXNG_INSTANCES = selected.url;
console.log(`[SEARXNG] has_api=${selected.hasApi}; network_type=normal; timing.api.response=${selected.apiResponse.toFixed(3)}s; url=${selected.url}`);
const budget = new GlobalApiBudget({ maxRequests: 1, agentLimits: { blacksmith: 1 } });
const gateway = new KnowledgeGateway({ instances: [selected.url] });
const result = await gateway.search({ query: 'Open Source Autonomous Agents', agentId: 'blacksmith', budget });
const snapshot = budget.snapshot();
if (snapshot.used !== 1 || snapshot.agentUsage.blacksmith !== 1) throw new Error(`Unexpected live request accounting: ${JSON.stringify(snapshot)}`);
const report = [
  '# ZForge Live Knowledge Gateway Response',
  '',
  '- Query: Open Source Autonomous Agents',
  `- SearXNG instance: ${selected.url}`,
  `- API preflight response: ${selected.apiResponse.toFixed(3)}s`,
  `- Requests consumed by Gateway search: ${snapshot.used}/1`,
  `- Results returned: ${result.resultCount}`,
  '- Trust: UNVERIFIED; search snippets are untrusted research evidence.',
  '',
  result.markdown,
  '',
].join('\n');
await writeFile('WEB_RESPONSE.md', report, { mode: 0o600 });
console.log('[GATEWAY] LIVE SEARCH SUCCEEDED');
console.log(`[BUDGET] used=${snapshot.used}/1; blacksmith=${snapshot.agentUsage.blacksmith}/1`);
console.log('[WEB_RESPONSE.md] BEGIN');
console.log(report);
console.log('[WEB_RESPONSE.md] END');
