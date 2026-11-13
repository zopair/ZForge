import { buildDiscoveryPlan } from './discovery-engine.js';
import { GitHubDiscoveryError } from '../adapters/github-discovery.js';

export class UniversalDiscoveryService {
  constructor({client,cache=new Map(),ttlMs=6*60*60*1000,maxQueriesPerRun=null,maxResultsPerQuery=15}={}){
    if(!client||typeof client.searchRepositories!=='function')throw new TypeError('A GitHubDiscoveryClient-compatible client is required');
    if(!(cache instanceof Map))throw new TypeError('cache must be a Map-compatible in-memory cache');
    if(!Number.isInteger(ttlMs)||ttlMs<0)throw new RangeError('ttlMs must be a non-negative integer');
    const budget=maxQueriesPerRun??(client.token?20:8);
    if(!Number.isInteger(budget)||budget<1||budget>30)throw new RangeError('maxQueriesPerRun must be 1..30');
    if(!Number.isInteger(maxResultsPerQuery)||maxResultsPerQuery<1||maxResultsPerQuery>100)throw new RangeError('maxResultsPerQuery must be 1..100');
    this.client=client;this.cache=cache;this.ttlMs=ttlMs;this.maxQueriesPerRun=budget;this.maxResultsPerQuery=maxResultsPerQuery;
  }
  async discover({capabilities=[],keywords=[],queryOffset=0,includeVendorSeeds=true}={}){
    if(!Number.isInteger(queryOffset)||queryOffset<0)throw new RangeError('queryOffset must be a non-negative integer');
    const plan=buildDiscoveryPlan({capabilities,keywords,maxQueries:120});
    const allQueries=[...plan.queries,...(includeVendorSeeds?plan.vendorQueries:[])];
    const unique=[...new Set(allQueries)];
    const selected=unique.slice(queryOffset,queryOffset+this.maxQueriesPerRun);
    const results=new Map();const searched=[];const cached=[];let rateLimit=null;let apiErrors=[];
    for(const query of selected){
      const cachedEntry=this.cache.get(query);
      if(cachedEntry&&Date.now()-cachedEntry.savedAt<this.ttlMs){
        cached.push(query);
        for(const item of cachedEntry.results)results.set(String(item.id??item.fullName),item);
        continue;
      }
      try{
        const response=await this.client.searchRepositories(query,{maxResults:this.maxResultsPerQuery});
        searched.push(query);
        this.cache.set(query,{savedAt:Date.now(),results:response.results});
        for(const item of response.results)results.set(String(item.id??item.fullName),item);
      }catch(error){
        if(error instanceof GitHubDiscoveryError&&(error.status===403||error.status===429)){
          rateLimit={status:error.status,resetAt:error.resetAt??null,message:error.message};
          break;
        }
        apiErrors.push({query,message:error instanceof Error?error.message:String(error)});
        break;
      }
    }
    const consumed=searched.length+cached.length;
    const nextOffset=rateLimit||apiErrors.length?queryOffset+consumed:queryOffset+selected.length;
    return {
      plan,
      results:[...results.values()],
      searchedQueries:searched,
      cachedQueries:cached,
      failedQueries:apiErrors,
      rateLimit,
      queryBudget:this.maxQueriesPerRun,
      queryOffset,
      nextOffset,
      remainingQueries:Math.max(0,unique.length-nextOffset),
      complete:nextOffset>=unique.length,
      status:rateLimit?'PAUSED_RATE_LIMIT':apiErrors.length?'PARTIAL_ERROR':nextOffset>=unique.length?'COMPLETE':'BATCH_COMPLETE',
      retrievedAt:new Date().toISOString(),
    };
  }
}
