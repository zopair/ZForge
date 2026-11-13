const API = 'https://api.github.com';
export class GitHubDiscoveryError extends Error {
  constructor(message, { status = 0, resetAt = null } = {}) { super(message); this.name='GitHubDiscoveryError'; this.status=status; this.resetAt=resetAt; }
}
function normalizeRepository(item){
  return {id:item.id,fullName:item.full_name,name:item.name,description:item.description,htmlUrl:item.html_url,defaultBranch:item.default_branch,archived:item.archived,pushedAt:item.pushed_at,updatedAt:item.updated_at,stars:item.stargazers_count,forks:item.forks_count,openIssues:item.open_issues_count,topics:item.topics??[],license:item.license?{spdxId:item.license.spdx_id,name:item.license.name,url:item.license.url}:null,language:item.language,sizeKb:item.size,discoveryOnly:true,evidence:{source:'GitHub API',licenseTextInspected:false,dependenciesInspected:false,testsRun:false}};
}
export class GitHubDiscoveryClient {
  constructor({ token = null, fetchImpl = globalThis.fetch, perPage = 30, maxPages = 2 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError('perPage must be 1..100');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new RangeError('maxPages must be 1..5');
    this.token=token; this.fetchImpl=fetchImpl; this.perPage=perPage; this.maxPages=maxPages;
  }
  async searchRepositories(query, { maxResults = 50, sort = 'updated', order = 'desc', page = 1 } = {}) {
    if (typeof query!=='string' || !query.trim()) throw new TypeError('query is required');
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 500) throw new RangeError('maxResults must be 1..500');
    if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer');
    const results=[];
    let totalCount=0;let pagesFetched=0;
    for (let pageNumber=page; pageNumber<page+this.maxPages && results.length<maxResults; pageNumber++) {
      const url=new URL('/search/repositories', API);
      url.searchParams.set('q',query);
      url.searchParams.set('per_page',String(Math.min(this.perPage,maxResults-results.length)));
      url.searchParams.set('page',String(pageNumber));
      url.searchParams.set('sort',sort);
      url.searchParams.set('order',order);
      const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
      if (this.token) headers.Authorization=`Bearer ${this.token}`;
      const response=await this.fetchImpl(url,{headers});
      if (response.status===403 || response.status===429) {
        const reset=response.headers?.get?.('x-ratelimit-reset');
        throw new GitHubDiscoveryError('GitHub search rate limit or access restriction reached; pause until the official reset window. No quota bypass is attempted.',{status:response.status,resetAt:reset?new Date(Number(reset)*1000).toISOString():null});
      }
      if (!response.ok) throw new GitHubDiscoveryError(`GitHub repository search failed with HTTP ${response.status}.`,{status:response.status});
      const payload=await response.json();
      pagesFetched++;
      totalCount=Number.isInteger(payload.total_count)?payload.total_count:totalCount;
      for (const item of payload.items ?? []) results.push(normalizeRepository(item));
      if (!payload.items?.length || results.length>=Math.min(maxResults,totalCount)) break;
    }
    const complete=results.length>=Math.min(maxResults,totalCount)||totalCount===0;
    const truncated=!complete;
    return { query, page, count:results.length, totalCount, results:results.slice(0,maxResults), complete, truncated, nextPage:truncated?page+pagesFetched:null, source:'GitHub Search API', retrievedAt:new Date().toISOString() };
  }
  async listOrganizationRepositories(organization,{page=1,perPage=100}={}){
    if(typeof organization!=='string'||!/^[-\\w.]+$/.test(organization))throw new TypeError('organization name is invalid');
    if(!Number.isInteger(page)||page<1)throw new RangeError('page must be a positive integer');
    if(!Number.isInteger(perPage)||perPage<1||perPage>100)throw new RangeError('perPage must be 1..100');
    const url=new URL(`/orgs/${encodeURIComponent(organization)}/repos`,API);
    url.searchParams.set('type','public');url.searchParams.set('sort','updated');url.searchParams.set('direction','desc');
    url.searchParams.set('per_page',String(perPage));url.searchParams.set('page',String(page));
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(this.token)headers.Authorization=`Bearer ${this.token}`;
    const response=await this.fetchImpl(url,{headers});
    if(response.status===403||response.status===429){
      const reset=response.headers?.get?.('x-ratelimit-reset');
      throw new GitHubDiscoveryError('GitHub core API rate limit reached; pause until the official reset window. No quota bypass is attempted.',{status:response.status,resetAt:reset?new Date(Number(reset)*1000).toISOString():null});
    }
    if(!response.ok)throw new GitHubDiscoveryError(`GitHub organization listing failed with HTTP ${response.status}.`,{status:response.status});
    const payload=await response.json();
    const results=(Array.isArray(payload)?payload:[]).map(normalizeRepository);
    return {organization,page,count:results.length,results,complete:results.length<perPage,nextPage:results.length<perPage?null:page+1,source:'GitHub Organization Repositories API',retrievedAt:new Date().toISOString()};
  }
}
