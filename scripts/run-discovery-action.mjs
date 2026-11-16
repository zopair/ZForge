import * as core from '@actions/core';
import { getDiscoveryActionContext, readDiscoveryCursor, writeDiscoveryCursor } from './discovery-action-context.mjs';
import { createDiscoveryAdapters } from '../src/adapters/discovery-adapters.js';
import { GlobalApiBudget } from '../src/core/global-api-budget.js';
import { UniversalDiscoveryService } from '../src/core/discovery-service.js';

function listInput(name) {
  return core.getInput(name, { required: false }).split(',').map(value => value.trim()).filter(Boolean);
}

async function run() {
  const context = getDiscoveryActionContext();
  const cursorPath = core.getInput('cursor-path', { required: false }) || 'discovery_cursor.json';
  const cachePath = core.getInput('cache-path', { required: false }) || 'discovery_cache.json';
  const cursorFile = await readDiscoveryCursor(cursorPath);
  const budget = new GlobalApiBudget({ maxRequests: context.apiBudget });
  const adapters = createDiscoveryAdapters({ token: context.token, budget });
  const maxQueries = Number(core.getInput('max-queries', { required: false }) || '25');
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 25) throw new RangeError('max-queries must be between 1 and 25');

  const service = new UniversalDiscoveryService({
    client: adapters.discovery,
    cachePath,
    maxApiRequestsPerRun: context.apiBudget,
    maxQueriesPerRun: maxQueries,
  });
  const savedCursor = cursorFile.cursor ?? {};
  const result = await service.discover({
    capabilities: listInput('capabilities'),
    keywords: listInput('keywords'),
    queryOffset: Number(savedCursor.queryOffset ?? 0),
    queryPage: Number(savedCursor.queryPage ?? 1),
    vendorOffset: Number(savedCursor.vendorOffset ?? 0),
    vendorPage: Number(savedCursor.vendorPage ?? 1),
    includeVendorSeeds: core.getInput('include-vendor-seeds', { required: false }) !== 'false',
  });

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
  core.info(`Discovery status=${result.status}; API requests=${result.apiRequests}/${result.apiRequestBudget}; candidates=${result.results.length}.`);
  if (result.failedQueries.length) core.warning(`${result.failedQueries.length} discovery queries need review.`);
  if (result.safeHalt) core.warning('Discovery stopped safely and checkpointed its cursor.');
}

run().catch(error => core.setFailed(error instanceof Error ? error.message : String(error)));
