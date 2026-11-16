import { GitHubApiClient } from './github-api-client.js';

export class GitHubDiscoveryError extends Error {
  constructor(message, { status = 0, resetAt = null, safeHalt = false, remaining = null, limit = null, resource = null, apiRequests = 0 } = {}) {
    super(message);
    this.name = 'GitHubDiscoveryError';
    this.status = status;
    this.resetAt = resetAt;
    this.safeHalt = safeHalt;
    this.remaining = remaining;
    this.limit = limit;
    this.resource = resource;
    this.apiRequests = apiRequests;
  }
}

function normalizeRepository(item) {
  return {
    id: item.id, fullName: item.full_name, name: item.name, description: item.description,
    htmlUrl: item.html_url, defaultBranch: item.default_branch, archived: item.archived,
    fork: item.fork === true, parentFullName: item.parent?.full_name ?? null,
    forkAheadBy: item.forkAheadBy ?? null, uniqueCommits: item.uniqueCommits ?? null,
    forkComparisonVerified: item.forkComparisonVerified === true, pushedAt: item.pushed_at,
    updatedAt: item.updated_at, stars: item.stargazers_count, forks: item.forks_count,
    openIssues: item.open_issues_count, topics: item.topics ?? [],
    license: item.license ? { spdxId: item.license.spdx_id, name: item.license.name, url: item.license.url } : null,
    language: item.language, sizeKb: item.size, discoveryOnly: true,
    evidence: { source: 'GitHub REST API via Octokit', licenseTextInspected: false, dependenciesInspected: false, testsRun: false },
  };
}

export class GitHubDiscoveryClient {
  constructor({ token = null, apiClient = null, budget = null, perPage = 30, maxPages = 1 } = {}) {
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError('perPage must be 1..100');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new RangeError('maxPages must be 1..5');
    this.apiClient = apiClient ?? new GitHubApiClient({ token, ...(budget ? { budget } : {}) });
    this.perPage = perPage;
    this.maxPages = maxPages;
    this.readOnly = true;
  }

  async request(route, parameters, resource = 'core') {
    try {
      return await this.apiClient.request(route, parameters, { resource });
    } catch (error) {
      if (error.status === 403 || error.status === 429 || this.apiClient.budget?.halted) {
        const quota = this.apiClient.budget?.snapshot?.().lastQuota ?? null;
        throw new GitHubDiscoveryError(error.message, {
          status: error.status ?? 0, safeHalt: true, resource,
          apiRequests: this.apiClient.budget?.snapshot?.().used ?? 0,
          remaining: quota?.remaining ?? null, limit: quota?.limit ?? null,
          resetAt: quota?.reset ?? null,
        });
      }
      throw new GitHubDiscoveryError(error.message, { status: error.status ?? 0, resource });
    }
  }

  async searchRepositories(query, { maxResults = 50, sort = 'updated', order = 'desc', page = 1 } = {}) {
    if (typeof query !== 'string' || !query.trim()) throw new TypeError('query is required');
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 500) throw new RangeError('maxResults must be 1..500');
    if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be positive');
    const results = [];
    let totalCount = 0;
    let pagesFetched = 0;
    for (let pageNumber = page; pageNumber < page + this.maxPages && results.length < maxResults; pageNumber++) {
      const response = await this.request('GET /search/repositories', {
        q: query, per_page: Math.min(this.perPage, maxResults - results.length), page: pageNumber, sort, order,
      }, 'search');
      const payload = response.data ?? {};
      pagesFetched += 1;
      totalCount = Number.isInteger(payload.total_count) ? payload.total_count : totalCount;
      for (const item of payload.items ?? []) {
        let candidate = item;
        if (item.fork === true) {
          const parentName = item.parent?.full_name;
          const upstreamBranch = item.parent?.default_branch;
          const forkOwner = item.owner?.login;
          const forkBranch = item.default_branch;
          if (!parentName || !upstreamBranch || !forkOwner || !forkBranch) { console.log(`[GATE] ${item.full_name ?? 'unknown'} — Rejected: Unqualified Fork (missing upstream comparison metadata)`); continue; }
          const [owner, repo] = parentName.split('/');
          if (!owner || !repo) { console.log(`[GATE] ${item.full_name ?? 'unknown'} — Rejected: Unqualified Fork (invalid upstream identity)`); continue; }
          const comparison = await this.request('GET /repos/{owner}/{repo}/compare/{base}...{head}', {
            owner, repo, base: upstreamBranch, head: `${forkOwner}:${forkBranch}`,
          }, 'core');
          const aheadBy = Number(comparison.data?.ahead_by);
          const uniqueCommits = Number(comparison.data?.total_commits);
          if (!(aheadBy > 0 && uniqueCommits > 0)) { console.log(`[GATE] ${item.full_name ?? 'unknown'} — Rejected: Unqualified Fork (ahead_by=${aheadBy}, unique_commits=${uniqueCommits})`); continue; }
          console.log(`[GATE] ${item.full_name} — Fork comparison passed (ahead_by=${aheadBy}, unique_commits=${uniqueCommits})`);
          candidate = { ...item, forkComparisonVerified: true, forkAheadBy: aheadBy, uniqueCommits };
        }
        results.push(normalizeRepository(candidate));
      }
      if (!payload.items?.length || results.length >= Math.min(maxResults, totalCount)) break;
    }
    const complete = results.length >= Math.min(maxResults, totalCount) || totalCount === 0;
    return {
      query, page, count: results.length, totalCount, results: results.slice(0, maxResults),
      complete, truncated: !complete, nextPage: !complete ? page + pagesFetched : null,
      source: 'GitHub REST API via Octokit (GET only)', retrievedAt: new Date().toISOString(),
    };
  }

  async listOrganizationRepositories(organization, { page = 1, perPage = 100 } = {}) {
    if (typeof organization !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(organization)) throw new TypeError('organization name is invalid');
    if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be positive');
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError('perPage must be 1..100');
    const response = await this.request('GET /orgs/{org}/repos', {
      org: organization, type: 'public', sort: 'updated', direction: 'desc', per_page: perPage, page,
    }, 'core');
    const payload = Array.isArray(response.data) ? response.data : [];
    const results = payload.map(normalizeRepository);
    return {
      organization, page, count: results.length, results, complete: results.length < perPage,
      nextPage: results.length < perPage ? null : page + 1,
      source: 'GitHub REST API via Octokit (GET only)', retrievedAt: new Date().toISOString(),
    };
  }
}
