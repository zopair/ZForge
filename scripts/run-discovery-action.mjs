import * as core from '@actions/core';
import { getDiscoveryActionContext, readDiscoveryCursor, writeDiscoveryCursor } from './discovery-action-context.mjs';
import { createDiscoveryAdapters } from '../src/adapters/discovery-adapters.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';
import { UniversalDiscoveryService } from '../src/core/discovery-service.js';
import { auditDiscoveredCandidates } from '../src/core/discovery-audit-pipeline.js';
import { renderCatalogEntry, renderDailyBrief } from '../src/core/discovery-output.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function listInput(name, environmentName) {
  return (core.getInput(name, { required: false }) || process.env[environmentName] || '')
    .split(',').map(value => value.trim()).filter(Boolean);
}

async function run() {
  const context = getDiscoveryActionContext();
  const cursorPath = core.getInput('cursor-path', { required: false }) || 'discovery_cursor.json';
  const cachePath = core.getInput('cache-path', { required: false }) || 'discovery_cache.json';
  const cursorFile = await readDiscoveryCursor(cursorPath);
  const budget = new GlobalApiBudget({ maxRequests: context.apiBudget });
  const adapters = createDiscoveryAdapters({ token: context.token, budget });
  const maxQueries = Number(core.getInput('max-queries', { required: false }) || process.env.DISCOVERY_MAX_QUERIES || '25');
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 25) throw new RangeError('max-queries must be between 1 and 25');

  const service = new UniversalDiscoveryService({
    client: adapters.discovery,
    cachePath,
    maxApiRequestsPerRun: context.apiBudget,
    maxQueriesPerRun: maxQueries,
  });
  const savedCursor = cursorFile.cursor ?? {};
  const capabilities = listInput('capabilities', 'DISCOVERY_CAPABILITIES');
  const keywords = listInput('keywords', 'DISCOVERY_KEYWORDS');
  core.info(`[DISCOVERY] Requested capabilities=${capabilities.join(',') || 'none'}; maxQueries=${maxQueries}; API budget=${context.apiBudget}; vendor seeds disabled unless explicitly enabled.`);
  const result = await service.discover({
    capabilities,
    keywords,
    queryOffset: Number(savedCursor.queryOffset ?? 0),
    queryPage: Number(savedCursor.queryPage ?? 1),
    vendorOffset: Number(savedCursor.vendorOffset ?? 0),
    vendorPage: Number(savedCursor.vendorPage ?? 1),
    includeVendorSeeds: (core.getInput('include-vendor-seeds', { required: false }) || process.env.DISCOVERY_INCLUDE_VENDOR_SEEDS || 'true') === 'true',
  });

  core.info(`[BUDGET] Discovery phase complete: used=${budget.snapshot().used}; remaining=${budget.snapshot().remainingBudget}; hard_limit=${budget.snapshot().maxRequests}.`);
  const audit = await auditDiscoveredCandidates({
    candidates: result.results,
    inspector: adapters.inspector,
    budget,
    logger: core,
  });
  const snapshot = budget.snapshot();
  core.info(`[BUDGET] Audit phase complete: used=${snapshot.used}; remaining=${snapshot.remainingBudget}; hard_limit=${snapshot.maxRequests}; halted=${snapshot.halted}.`);

  const catalogPath = 'research_logs/tools_catalog.md';
  const briefPath = 'DAILY_BRIEF.md';
  await mkdir('research_logs', { recursive: true });
  let catalog = '';
  try { catalog = await readFile(catalogPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!catalog.trim()) catalog = '# ZForge Research Tools Catalog\n\n';
  const catalogEntries = audit.accepted.map(candidate => renderCatalogEntry({
    ...candidate,
    date: new Date().toISOString().slice(0, 10),
    evidence: candidate.evidence,
  }));
  const catalogOutput = catalogEntries.length
    ? `${catalog.trimEnd()}\n\n${catalogEntries.join('\n')}`
    : catalog.trimEnd() + '\n\n_No newly verified candidates in this bounded run._\n';
  await writeFile(catalogPath, catalogOutput, 'utf8');
  core.info(`[OUTPUT] Wrote ${catalogPath}; newly accepted entries=${catalogEntries.length}; bytes=${Buffer.byteLength(catalogOutput)}.`);

  const brief = renderDailyBrief({
    discoveries: audit.accepted,
    apiRequests: snapshot.used,
    apiRequestBudget: snapshot.maxRequests,
    dryRun: false,
    audit: { processed: audit.processed, accepted: audit.accepted.length, rejected: audit.rejected.length, quarantined: audit.quarantined.length, skipped: audit.skipped },
  });
  await writeFile(briefPath, brief + '\n', 'utf8');
  const digest = createHash('sha256').update(brief + '\n', 'utf8').digest('hex');
  core.info(`[OUTPUT] Wrote ${briefPath}; bytes=${Buffer.byteLength(brief + '\n')}.`);
  core.info(`[SHA256] ${briefPath} ${digest}`);

  await writeDiscoveryCursor({
    cursor: {
      queryOffset: result.nextOffset,
      queryPage: result.nextQueryPage,
      vendorOffset: result.nextVendorOffset,
      vendorPage: result.nextVendorPage,
    },
  }, cursorPath);
  core.setOutput('discovery_status', result.status);
  core.setOutput('api_requests', String(result.apiRequests));
  core.setOutput('api_request_budget', String(result.apiRequestBudget));
  core.setOutput('discovery_complete', String(result.complete));
  core.setOutput('audit_processed', String(audit.processed));
  core.setOutput('audit_accepted', String(audit.accepted.length));
  core.setOutput('audit_rejected', String(audit.rejected.length));
  core.setOutput('audit_quarantined', String(audit.quarantined.length));
  core.info(`Discovery status=${result.status}; API requests=${snapshot.used}/${snapshot.maxRequests}; candidates=${result.results.length}; inspected=${audit.processed}; accepted=${audit.accepted.length}; rejected=${audit.rejected.length}; quarantined=${audit.quarantined.length}; skipped=${audit.skipped}.`);
  if (result.failedQueries.length) core.warning(`${result.failedQueries.length} discovery queries need review.`);
  if (result.safeHalt) core.warning('Discovery stopped safely and checkpointed its cursor.');
}

run().catch(error => core.setFailed(error instanceof Error ? error.message : String(error)));
