import { buildDiscoveryPlan } from './discovery-engine.js';
import { GitHubDiscoveryError } from '../adapters/github-discovery.js';

export class UniversalDiscoveryService {
  constructor({client,cache=new Map(),ttlMs=6*60*60*1000,maxQueriesPerRun=null,maxResultsPerQuery=15,maxVendorOrgsPerRun=2}={}){
    if(!client||typeof client.searchRepositories!=='function')throw new TypeError('A GitHubDiscoveryClient-compatible client is required');
    if(!(cache instanceof Map))throw new TypeError('cache must be a Map-compatible in-memory cache');
    if(!Number.isInteger(ttlMs)||ttlMs<0)throw new RangeError('ttlMs must be a non-negative integer');
    const budget=maxQueriesPerRun??(client.token?20:8);
    if(!Number.isInteger(budget)||budget<1||budget>30)throw new RangeError('maxQueriesPerRun must be 1..30');
    if(!Number.isInteger(maxResultsPerQuery)||maxResultsPerQuery<1||maxResultsPerQuery>100)throw new RangeError('maxResultsPerQuery must be 1..100');
    if(!Number.isInteger(maxVendorOrgsPerRun)||maxVendorOrgsPerRun<1||maxVendorOrgsPerRun>7)throw new RangeError('maxVendorOrgsPerRun must be 1..7');
    this.client=client;this.cache=cache;this.ttlMs=ttlMs;this.maxQueriesPerRun=budget;this.maxResultsPerQuery=maxResultsPerQuery;this.maxVendorOrgsPerRun=maxVendorOrgsPerRun;
  }
  async discover({capabilities=[],keywords=[],queryOffset=0,includeVendorSeeds=true,vendorOffset=0,vendorPage=1}={}){
    if(!Number.isInteger(queryOffset)||queryOffset<0)throw new RangeError('queryOffset must be a non-negative integer');
    if(!Number.isInteger(vendorOffset)||vendorOffset<0)throw new RangeError('vendorOffset must be a non-negative integer');
    if(!Number.isInteger(vendorPage)||vendorPage<1)throw new RangeError('vendorPage must be a positive integer');
    const plan=buildDiscoveryPlan({capabilities,keywords,maxQueries:120});
    const allQueries=[...plan.queries,...(includeVendorSeeds?plan.vendorQueries:[])];
    const unique=[...new Set(allQueries)];
    const selected=unique.slice(queryOffset,queryOffset+this.maxQueriesPerRun);
    const organizations=includeVendorSeeds?plan.vendorSeeds.flatMap(vendor=>vendor.orgs.map(org=>({vendor:vendor.id,organization:org}))):[];
    const selectedOrganizations=typeof this.client.listOrganizationRepositories==='function'
      ?organizations.slice(vendorOffset,vendorOffset+this.maxVendorOrgsPerRun):[];
    const results=new Map();const searched=[];const cached=[];const organizationScans=[];const organizationCached=[];
    let rateLimit=null;const apiErrors=[];
    const addResults=items=>{for(const item of items??[])results.set(String(item.id??item.fullName),item);};
    for(const query of selected){
      const key=`query:${query}`;const cachedEntry=this.cache.get(key);
      if(cachedEntry&&Date.now()-cachedEntry.savedAt<this.ttlMs){cached.push(query);addResults(cachedEntry.results);continue;}
      try{
        const response=await this.client.searchRepositories(query,{maxResults:this.maxResultsPerQuery});
        searched.push(query);this.cache.set(key,{savedAt:Date.now(),results:response.results});addResults(response.results);
      }catch(error){
        if(error instanceof GitHubDiscoveryError&&(error.status===403||error.status===429)){rateLimit={status:error.status,resetAt:error.resetAt??null,message:error.message};break;}
        apiErrors.push({query,message:error instanceof Error?error.message:String(error)});break;
      }
    }
    const consumed=searched.length+cached.length;
    const nextOffset=rateLimit||apiErrors.length?queryOffset+consumed:queryOffset+selected.length;
    let nextVendorOffset=vendorOffset;let nextVendorPage=vendorPage;
    if(!rateLimit&&!apiErrors.length&&includeVendorSeeds&&typeof this.client.listOrganizationRepositories==='function'){
      for(const entry of selectedOrganizations){
        const key=`org:${entry.organization}:page:${nextVendorPage}`;const cachedEntry=this.cache.get(key);
        let response;
        if(cachedEntry&&Date.now()-cachedEntry.savedAt<this.ttlMs){response=cachedEntry.response;organizationCached.push(entry.organization);}
        else{
          try{
            response=await this.client.listOrganizationRepositories(entry.organization,{page:nextVendorPage,perPage:100});
            this.cache.set(key,{savedAt:Date.now(),response});
          }catch(error){
            if(error instanceof GitHubDiscoveryError&&(error.status===403||error.status===429)){rateLimit={status:error.status,resetAt:error.resetAt??null,message:error.message};break;}
            apiErrors.push({organization:entry.organization,message:error instanceof Error?error.message:String(error)});break;
          }
        }
        addResults(response.results);
        organizationScans.push({vendor:entry.vendor,organization:entry.organization,page:nextVendorPage,count:response.count,complete:response.complete});
        if(response.complete){nextVendorOffset++;nextVendorPage=1;}
        else{nextVendorPage=response.nextPage??nextVendorPage+1;break;}
      }
    }
    const vendorScanAvailable=!includeVendorSeeds||typeof this.client.listOrganizationRepositories==='function';
    const queryComplete=nextOffset>=unique.length;
    const vendorComplete=!includeVendorSeeds||nextVendorOffset>=organizations.length;
    const complete=queryComplete&&vendorComplete;
    return {
      plan,results:[...results.values()],searchedQueries:searched,cachedQueries:cached,
      vendorOrganizationsScanned:organizationScans,vendorOrganizationsCached:organizationCached,
      vendorScanAvailable,failedQueries:apiErrors,rateLimit,queryBudget:this.maxQueriesPerRun,
      queryOffset,nextOffset,remainingQueries:Math.max(0,unique.length-nextOffset),
      vendorOffset,nextVendorOffset,nextVendorPage,remainingVendorOrganizations:Math.max(0,organizations.length-nextVendorOffset),
      complete,
      status:rateLimit?'PAUSED_RATE_LIMIT':apiErrors.length?'PARTIAL_ERROR':!vendorScanAvailable?'VENDOR_SCAN_UNAVAILABLE':complete?'COMPLETE':'BATCH_COMPLETE',
      retrievedAt:new Date().toISOString(),
    };
  }
}
