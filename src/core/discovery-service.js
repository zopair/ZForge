import { GitHubDiscoveryError } from '../adapters/github-discovery.js';
import { buildDiscoveryPlan } from './discovery-engine.js';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CACHE_PATH = path.resolve(process.cwd(), 'discovery_cache.json');
const CACHE_VERSION = 1;

export class JsonDiscoveryCache {
  constructor({ filePath = DEFAULT_CACHE_PATH, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('filePath is required');
    if (!Number.isInteger(ttlMs) || ttlMs < 0) throw new RangeError('ttlMs must be non-negative');
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    this.entries = new Map();
    this.loaded = false;
    this.dirty = false;
  }
  async load() {
    if (this.loaded) return this;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) throw new Error('Unsupported discovery cache format');
      this.entries = new Map(parsed.entries.filter(([key, value]) => typeof key === 'string' && value && Number.isFinite(value.savedAt)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.entries = new Map();
    }
    this.loaded = true;
    return this;
  }
  get(key) { return this.entries.get(key); }
  set(key, value) { this.entries.set(key, value); this.dirty = true; }
  has(key) { return this.entries.has(key); }
  async save({ checkpoint = null, apiRequests = 0 } = {}) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = {
      version: CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      checkpoint,
      apiRequests,
      visitedRepositories: [...this.entries.keys()].filter(key => key.startsWith('repo:')).map(key => key.slice(5)),
      entries: [...this.entries.entries()],
    };
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, this.filePath);
    this.dirty = false;
  }
}

export class UniversalDiscoveryService {
  constructor({ client, cache = null, cachePath = DEFAULT_CACHE_PATH, ttlMs = 24 * 60 * 60 * 1000, maxApiRequestsPerRun = 50, maxQueriesPerRun = 25, maxResultsPerQuery = 50, maxVendorOrgsPerRun = 2 } = {}) {
    if (!client || typeof client.searchRepositories !== 'function') throw new TypeError('A GitHubDiscoveryClient-compatible client is required');
    if (!Number.isInteger(ttlMs) || ttlMs < 0) throw new RangeError('ttlMs must be non-negative');
    if (!Number.isInteger(maxApiRequestsPerRun) || maxApiRequestsPerRun < 1 || maxApiRequestsPerRun > 50) throw new RangeError('maxApiRequestsPerRun must be 1..50');
    if (!Number.isInteger(maxQueriesPerRun) || maxQueriesPerRun < 1 || maxQueriesPerRun > 25) throw new RangeError('maxQueriesPerRun must be 1..25 (each query includes a rate-limit preflight)');
    if (!Number.isInteger(maxResultsPerQuery) || maxResultsPerQuery < 1 || maxResultsPerQuery > 100) throw new RangeError('maxResultsPerQuery must be 1..100');
    if (!Number.isInteger(maxVendorOrgsPerRun) || maxVendorOrgsPerRun < 1 || maxVendorOrgsPerRun > 7) throw new RangeError('maxVendorOrgsPerRun must be 1..7');
    this.client = client;
    this.budget = client.apiClient?.budget ?? client.budget ?? null;
    this.cache = cache ?? new JsonDiscoveryCache({ filePath: cachePath, ttlMs });
    this.ttlMs = ttlMs;
    this.maxApiRequestsPerRun = Math.min(maxApiRequestsPerRun, this.budget?.maxRequests ?? maxApiRequestsPerRun);
    if (this.budget && this.budget.maxRequests > this.maxApiRequestsPerRun) this.budget.maxRequests = this.maxApiRequestsPerRun;
    const fallbackRequestCost = client.requestsPerOperation ?? 2;
    this.maxQueriesPerRun = this.budget
      ? maxQueriesPerRun
      : Math.min(maxQueriesPerRun, Math.floor(this.maxApiRequestsPerRun / fallbackRequestCost));
    this.maxResultsPerQuery = maxResultsPerQuery;
    this.maxVendorOrgsPerRun = maxVendorOrgsPerRun;
  }
  async discover({ capabilities = [], keywords = [], queryOffset = 0, queryPage = 1, includeVendorSeeds = true, vendorOffset = 0, vendorPage = 1 } = {}) {
    if (!Number.isInteger(queryOffset) || queryOffset < 0) throw new RangeError('queryOffset must be non-negative');
    if (!Number.isInteger(queryPage) || queryPage < 1) throw new RangeError('queryPage must be positive');
    if (!Number.isInteger(vendorOffset) || vendorOffset < 0) throw new RangeError('vendorOffset must be non-negative');
    if (!Number.isInteger(vendorPage) || vendorPage < 1) throw new RangeError('vendorPage must be positive');
    if (typeof this.cache.load === 'function') await this.cache.load();
    const plan = buildDiscoveryPlan({ capabilities, keywords, maxQueries: 500 });
    const unique = [...new Set([...plan.queries, ...(includeVendorSeeds ? plan.vendorQueries : [])])];
    const selected = unique.slice(queryOffset, queryOffset + this.maxQueriesPerRun);
    const organizations = includeVendorSeeds ? plan.vendorSeeds.flatMap(vendor => vendor.orgs.map(org => ({ vendor: vendor.id, organization: org }))) : [];
    const selectedOrganizations = typeof this.client.listOrganizationRepositories === 'function' ? organizations.slice(vendorOffset, vendorOffset + this.maxVendorOrgsPerRun) : [];
    const results = new Map(); const searched = []; const cached = []; const queryReports = [];
    const organizationScans = []; const organizationCached = []; const apiErrors = []; const unavailableOrganizations = [];
    let rateLimit = null; let safeHalt = false; let fatalError = false;
    let apiRequests = this.budget?.snapshot?.().used ?? 0;
    let nextOffset = queryOffset; let nextQueryPage = queryPage; let nextVendorOffset = vendorOffset; let nextVendorPage = vendorPage;
    const addResults = items => { for (const item of items ?? []) { const key = String(item.fullName ?? item.id); results.set(key, item); if (key && key !== 'undefined') this.cache.set(`repo:${key.toLowerCase()}`, { savedAt: Date.now(), response: { repository: item } }); } };
    const persist = async () => { if (typeof this.cache.save === 'function') await this.cache.save({ checkpoint: { queryOffset: nextOffset, queryPage: nextQueryPage, vendorOffset: nextVendorOffset, vendorPage: nextVendorPage }, apiRequests }); };
    const requestCost = this.client.requestsPerOperation ?? 2;
    const syncApiRequests = () => {
      const snapshot = this.budget?.snapshot?.();
      if (snapshot) apiRequests = snapshot.used;
    };
    const budgetAllows = () => {
      const snapshot = this.budget?.snapshot?.();
      return snapshot
        ? !snapshot.halted && snapshot.used < this.maxApiRequestsPerRun
        : apiRequests + requestCost <= this.maxApiRequestsPerRun;
    };
    for (let index = 0; index < selected.length; index++) {
      const query = selected[index]; const page = index === 0 ? queryPage : 1; const key = `query:${query}:page:${page}`;
      const cachedEntry = this.cache.get(key);
      if (cachedEntry && Date.now() - cachedEntry.savedAt < this.ttlMs) {
        addResults(cachedEntry.response.results); cached.push(query);
      } else {
        if (!budgetAllows()) break;
        try {
          const response = await this.client.searchRepositories(query, { maxResults: this.maxResultsPerQuery, page });
          syncApiRequests(); searched.push(query); this.cache.set(key, { savedAt: Date.now(), response });
          addResults(response.results);
          queryReports.push({ query, page, count: response.count ?? response.results?.length ?? 0, totalCount: response.totalCount ?? null, complete: response.complete !== false, nextPage: response.nextPage ?? null });
          if (response.complete === false) { nextOffset = queryOffset + index; nextQueryPage = response.nextPage ?? page + 1; break; }
        } catch (error) {
          syncApiRequests();
          if (!this.budget) apiRequests += Number.isInteger(error.apiRequests) ? error.apiRequests : 1;
          if (error.safeHalt) { safeHalt = true; rateLimit = { remaining: error.remaining, limit: error.limit, resource: error.resource, message: error.message }; nextOffset = queryOffset + index; nextQueryPage = page; break; }
          if (error instanceof GitHubDiscoveryError && (error.status === 403 || error.status === 429)) { rateLimit = { status: error.status, resetAt: error.resetAt ?? null, message: error.message }; nextOffset = queryOffset + index; nextQueryPage = page; break; }
          apiErrors.push({ query, message: error instanceof Error ? error.message : String(error), status: error.status ?? null });
          if (error instanceof GitHubDiscoveryError && (error.status === 404 || error.status === 422)) { nextOffset = queryOffset + index + 1; nextQueryPage = 1; continue; }
          fatalError = true; break;
        }
      }
      nextOffset = queryOffset + index + 1; nextQueryPage = 1;
    }
    if (!rateLimit && !fatalError && !safeHalt && includeVendorSeeds && typeof this.client.listOrganizationRepositories === 'function') {
      let currentOffset = vendorOffset; let currentPage = vendorPage;
      for (const entry of selectedOrganizations) {
        const key = `org:${entry.organization}:page:${currentPage}`; const cachedEntry = this.cache.get(key);
        if (cachedEntry && Date.now() - cachedEntry.savedAt < this.ttlMs) {
          addResults(cachedEntry.response.results); organizationCached.push(entry.organization);
        } else {
          if (!budgetAllows()) break;
          try {
            const response = await this.client.listOrganizationRepositories(entry.organization, { page: currentPage, perPage: 100 });
            syncApiRequests(); this.cache.set(key, { savedAt: Date.now(), response }); addResults(response.results);
            organizationScans.push({ vendor: entry.vendor, organization: entry.organization, page: currentPage, count: response.count, complete: response.complete });
            if (!response.complete) { currentPage = response.nextPage ?? currentPage + 1; break; }
          } catch (error) {
            syncApiRequests();
            if (error.safeHalt) { safeHalt = true; rateLimit = { remaining: error.remaining, limit: error.limit, resource: error.resource, message: error.message }; break; }
            if (error instanceof GitHubDiscoveryError && (error.status === 403 || error.status === 429)) { rateLimit = { status: error.status, resetAt: error.resetAt ?? null, message: error.message }; break; }
            if (error instanceof GitHubDiscoveryError && error.status === 404) unavailableOrganizations.push(entry.organization);
            else { apiErrors.push({ organization: entry.organization, message: error instanceof Error ? error.message : String(error), status: error.status ?? null }); fatalError = true; break; }
          }
        }
        currentOffset++; currentPage = 1;
      }
      nextVendorOffset = currentOffset; nextVendorPage = currentPage;
    }
    syncApiRequests();
    await persist();
    const queryComplete = nextOffset >= unique.length;
    const vendorComplete = !includeVendorSeeds || nextVendorOffset >= organizations.length;
    const complete = queryComplete && vendorComplete && apiErrors.length === 0 && unavailableOrganizations.length === 0;
    return {
      plan, results: [...results.values()], searchedQueries: searched, cachedQueries: cached, queryReports,
      vendorOrganizationsScanned: organizationScans, vendorOrganizationsCached: organizationCached, unavailableOrganizations,
      vendorScanAvailable: !includeVendorSeeds || typeof this.client.listOrganizationRepositories === 'function',
      failedQueries: apiErrors, rateLimit, safeHalt, apiRequests, apiRequestBudget: this.maxApiRequestsPerRun,
      queryBudget: this.maxQueriesPerRun, queryOffset, nextOffset, queryPage, nextQueryPage,
      remainingQueries: Math.max(0, unique.length - nextOffset), vendorOffset, nextVendorOffset, nextVendorPage,
      remainingVendorOrganizations: Math.max(0, organizations.length - nextVendorOffset), complete,
      status: safeHalt ? 'GRACEFUL_HALT' : rateLimit ? 'PAUSED_RATE_LIMIT' : apiErrors.length || unavailableOrganizations.length ? 'PARTIAL_ERROR' : complete ? 'COMPLETE' : 'BATCH_COMPLETE',
      retrievedAt: new Date().toISOString(),
    };
  }
}
