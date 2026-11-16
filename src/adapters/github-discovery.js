const API = 'https://api.github.com';
const RATE_LIMIT_THRESHOLD = 0.10;

export class GitHubDiscoveryError extends Error {
  constructor(message, { status = 0, resetAt = null, safeHalt = false, remaining = null, limit = null, resource = null, apiRequests = 0 } = {}) {
    super(message); this.name = 'GitHubDiscoveryError'; this.status = status; this.resetAt = resetAt;
    this.safeHalt = safeHalt; this.remaining = remaining; this.limit = limit; this.resource = resource; this.apiRequests = apiRequests;
  }
}
function normalizeRepository(item) {
  return { id:item.id, fullName:item.full_name, name:item.name, description:item.description, htmlUrl:item.html_url,
    defaultBranch:item.default_branch, archived:item.archived, pushedAt:item.pushed_at, updatedAt:item.updated_at,
    stars:item.stargazers_count, forks:item.forks_count, openIssues:item.open_issues_count, topics:item.topics ?? [],
    license:item.license ? {spdxId:item.license.spdx_id,name:item.license.name,url:item.license.url} : null,
    language:item.language,sizeKb:item.size,discoveryOnly:true,
    evidence:{source:'GitHub REST API',licenseTextInspected:false,dependenciesInspected:false,testsRun:false} };
}
export class GitHubDiscoveryClient {
  constructor({ token = null, fetchImpl = globalThis.fetch, perPage = 30, maxPages = 1, rateLimitThreshold = RATE_LIMIT_THRESHOLD } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError('perPage must be 1..100');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new RangeError('maxPages must be 1..5');
    if (typeof rateLimitThreshold !== 'number' || rateLimitThreshold <= 0 || rateLimitThreshold >= 1) throw new RangeError('rateLimitThreshold must be between 0 and 1');
    this.token = token; this.fetchImpl = fetchImpl; this.perPage = perPage; this.maxPages = maxPages;
    this.rateLimitThreshold = rateLimitThreshold; this.requestsPerOperation = 2; this.readOnly = true;
  }
  async preflight(resource) {
    const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response;
    try { response = await this.fetchImpl(new URL('/rate_limit', API), {method:'GET',headers}); }
    catch (cause) { throw new GitHubDiscoveryError(`Rate-limit preflight failed; discovery halted safely: ${cause.message}`,{safeHalt:true,resource,apiRequests:1}); }
    if (!response.ok) throw new GitHubDiscoveryError(`Rate-limit preflight returned HTTP ${response.status}; discovery halted safely.`,{status:response.status,safeHalt:true,resource,apiRequests:1});
    const payload = await response.json();
    const bucket = payload.resources?.[resource] ?? payload.resources?.core;
    const remaining = Number(bucket?.remaining); const limit = Number(bucket?.limit);
    if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) {
      throw new GitHubDiscoveryError('Rate-limit preflight returned unverifiable quota metadata; discovery halted safely.',{safeHalt:true,resource,apiRequests:1});
    }
    if (remaining / limit < this.rateLimitThreshold) {
      throw new GitHubDiscoveryError('Remaining GitHub API quota is below 10%; progress checkpointed and discovery gracefully halted.',{safeHalt:true,remaining,limit,resource,apiRequests:1});
    }
    return {remaining,limit,resource};
  }
  async request(url, resource) {
    await this.preflight(resource);
    const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response;
    try { response = await this.fetchImpl(url,{method:'GET',headers}); }
    catch (cause) { throw new GitHubDiscoveryError(`GitHub read-only request failed: ${cause.message}`,{resource,apiRequests:2}); }
    if (response.status === 403 || response.status === 429) {
      const reset=response.headers?.get?.('x-ratelimit-reset');
      throw new GitHubDiscoveryError('GitHub API rate limit or access restriction reached; pause until official reset. No quota bypass is attempted.',{status:response.status,resetAt:reset?new Date(Number(reset)*1000).toISOString():null,resource,apiRequests:2});
    }
    if (!response.ok) throw new GitHubDiscoveryError(`GitHub API request failed with HTTP ${response.status}.`,{status:response.status,resource,apiRequests:2});
    return response;
  }
  async searchRepositories(query,{maxResults=50,sort='updated',order='desc',page=1}={}) {
    if(typeof query!=='string'||!query.trim())throw new TypeError('query is required');
    if(!Number.isInteger(maxResults)||maxResults<1||maxResults>500)throw new RangeError('maxResults must be 1..500');
    if(!Number.isInteger(page)||page<1)throw new RangeError('page must be positive');
    const results=[];let totalCount=0;let pagesFetched=0;
    for(let pageNumber=page;pageNumber<page+this.maxPages&&results.length<maxResults;pageNumber++){
      const url=new URL('/search/repositories',API);url.searchParams.set('q',query);
      url.searchParams.set('per_page',String(Math.min(this.perPage,maxResults-results.length)));
      url.searchParams.set('page',String(pageNumber));url.searchParams.set('sort',sort);url.searchParams.set('order',order);
      const response=await this.request(url,'search');const payload=await response.json();pagesFetched++;
      totalCount=Number.isInteger(payload.total_count)?payload.total_count:totalCount;
      for(const item of payload.items??[])results.push(normalizeRepository(item));
      if(!payload.items?.length||results.length>=Math.min(maxResults,totalCount))break;
    }
    const complete=results.length>=Math.min(maxResults,totalCount)||totalCount===0;
    return {query,page,count:results.length,totalCount,results:results.slice(0,maxResults),complete,truncated:!complete,
      nextPage:!complete?page+pagesFetched:null,source:'GitHub Search API (GET only)',retrievedAt:new Date().toISOString()};
  }
  async listOrganizationRepositories(organization,{page=1,perPage=100}={}) {
    if(typeof organization!=='string'||!/^[-\\w.]+$/.test(organization))throw new TypeError('organization name is invalid');
    if(!Number.isInteger(page)||page<1)throw new RangeError('page must be positive');
    if(!Number.isInteger(perPage)||perPage<1||perPage>100)throw new RangeError('perPage must be 1..100');
    const url=new URL(`/orgs/${encodeURIComponent(organization)}/repos`,API);
    url.searchParams.set('type','public');url.searchParams.set('sort','updated');url.searchParams.set('direction','desc');
    url.searchParams.set('per_page',String(perPage));url.searchParams.set('page',String(page));
    const response=await this.request(url,'core');const payload=await response.json();
    const results=(Array.isArray(payload)?payload:[]).map(normalizeRepository);
    return {organization,page,count:results.length,results,complete:results.length<perPage,nextPage:results.length<perPage?null:page+1,
      source:'GitHub Organization Repositories API (GET only)',retrievedAt:new Date().toISOString()};
  }
}
