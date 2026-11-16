import { writeFile } from 'node:fs/promises';
import { KnowledgeGateway } from '../src/adapters/knowledge-gateway.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';

const metadataUrl = 'https://searx.space/data/instances.json';
const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
if (!metadataResponse.ok) throw new Error(`SearXNG instance metadata returned HTTP ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const instances = metadata.instances ?? metadata;
const candidates = Object.entries(instances).flatMap(([key, item]) => {
  const url = item?.url ?? item?.http?.url ?? (key.startsWith('https://') ? key : `https://${key}`);
  const responseTime = Number(item?.timing?.api?.response);
  const healthy = item?.has_api === true && item?.network_type === 'normal'
    && Number.isFinite(responseTime) && responseTime > 0 && responseTime <= 5
    && (item?.http?.status_code === undefined || item.http.status_code === 200);
  if (!healthy) return [];
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return [];
    return [{ url: parsed.origin, responseTime }];
  } catch { return []; }
}).sort((a, b) => a.responseTime - b.responseTime);
if (!candidates.length) throw new Error('No SearXNG instance passed has_api=true, network_type=normal, healthy timing.api.response <= 5s, and HTTPS checks.');
const selected = candidates[0];
process.env.ZFORGE_SEARXNG_INSTANCES = selected.url;
console.log(`[SEARXNG] selected=${selected.url} api_response_seconds=${selected.responseTime}`);
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
  `- Requests consumed: ${snapshot.used}/1`,
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
