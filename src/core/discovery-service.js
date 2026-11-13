import { buildDiscoveryPlan } from './discovery-engine.js';
import { GitHubDiscoveryError } from '../adapters/github-discovery.js';

export class UniversalDiscoveryService {
  constructor({client,cache=new Map(),ttlMs=6*60*60*1000,maxQueriesPerRun=null,maxResultsPerQuery=50,maxVendorOrgsPerRun=2}={}){
    if(!client||typeof client.searchRepositories!=='function')throw new TypeError('A GitHubDiscoveryClient-compatible client is required');
    if(!(cache instanceof Map))throw new TypeError('cache must be a Map-compatible in-memory cache');
    if(!Number.isInteger(ttlMs)||ttlMs<0)throw new RangeError('ttlMs must be a non-negative integer');
    const budget=maxQueriesPerRun??(client.token?20:8);
    if(!Number.isInteger(budget)||budget<1||budget>30)throw new RangeError('maxQueriesPerRun must be 1..30');
    if(!Number.isInteger(maxResultsPerQuery)||maxResultsPerQuery<1||maxResultsPerQuery>100)throw new RangeError('maxResultsPerQuery must be 1..100');
    if(!Number.isInteger(maxVendorOrgsPerRun)||maxVendorOrgsPerRun<1||maxVendorOrgsPerRun>7)throw new RangeError('maxVendorOrgsPerRun must be 1..7');
    this.client=client;this.cache=cache;this.ttlMs=ttlMs;this.maxQueriesPerRun=budget;this.maxResultsPerQuery=maxResultsPerQuery;this.maxVendorOrgsPerRun=maxVendorOrgsPerRun;
  }
  async discover({capabilities=[],keywords=[],queryOffset=0,queryPage=1,includeVendorSeeds=true,vendorOffset=0,vendorPage=1}={}){
    if(!Number.isInteger(queryOffset)||queryOffset<0)throw new RangeError('queryOffset must be a non-negative integer');
    if(!Number.isInteger(queryPage)||queryPage<1)throw new RangeError('queryPage must be a positive integer');
    if(!Number.isInteger(vendorOffset)||vendorOffset<0)throw new RangeError('vendorOffset must be a non-negative integer');
    if(!Number.isInteger(vendorPage)||vendorPage<1)throw new RangeError('vendorPage must be a positive integer');
    const plan=buildDiscoveryPlan({capabilities,keywords,maxQueries:500});
    const allQueries=[...plan.queries,...(includeVendorSeeds?plan.vendorQueries:[])];
    const unique=[...new Set(allQueries)];
    const selected=unique.slice(queryOffset,queryOffset+this.maxQueriesPerRun);
    const organizations=includeVendorSeeds?plan.vendorSeeds.flatMap(vendor=>vendor.orgs.map(org=>({vendor:vendor.id,organization:org}))):[];
    const selectedOrganizations=typeof this.client.listOrganizationRepositories==='function'
      ?organizations.slice(vendorOffset,vendorOffset+this.maxVendorOrgsPerRun):[];
    const results=new Map();const searched=[];const cached=[];const queryReports=[];
    const organizationScans=[];const organizationCached=[];
    let rateLimit=null;const apiErrors=[];const unavailableOrganizations=[];let fatalError=false;let nextOffset=queryOffset;let nextQueryPage=queryPage;let nextVendorOffset=vendorOffset;let nextVendorPage=vendorPage;
    const addResults=items=>{for(const item of items??[])results.set(String(item.id??item.fullName),item);};
    for(let index=0;index<selected.length;index++){
      const query=selected[index];const page=index===0?queryPage:1;const key=`query:${query}:page:${page}`;
      let response;const cachedEntry=this.cache.get(key);
      if(cachedEntry&&Date.now()-cachedEntry.savedAt<this.ttlMs){response=cachedEntry.response;cached.push(query);}
      else{
        try{
          response=await this.client.searchRepositories(query,{maxResults:this.maxResultsPerQuery,page});
          searched.push(query);this.cache.set(key,{savedAt:Date.now(),response});
        }catch(error){
          if(error instanceof GitHubDiscoveryError&&(error.status===403||error.status===429)){rateLimit={status:error.status,resetAt:error.resetAt??null,message:error.message};break;}
          apiErrors.push({query,message:error instanceof Error?error.message:String(error),status:error.status??null});
          if(error instanceof GitHubDiscoveryError&&(error.status===404||error.status===422)){nextOffset=queryOffset+index+1;nextQueryPage=1;continue;}
          fatalError=true;break;
        }
      }
      addResults(response.results);
      queryReports.push({query,page,count:response.count??response.results?.length??0,totalCount:response.totalCount??null,complete:response.complete!==false,nextPage:response.nextPage??null});
      if(response.complete===false){
        nextOffset=queryOffset+index;nextQueryPage=response.nextPage??page+1;break;
      }
      nextOffset=queryOffset+index+1;nextQueryPage=1;
    }
    if(!rateLimit&&!fatalError&&includeVendorSeeds&&typeof this.client.listOrganizationRepositories==='function'){
      let currentVendorOffset=vendorOffset;let currentVendorPage=vendorPage;
      for(const entry of selectedOrganizations){
        const key=`org:${entry.organization}:page:${currentVendorPage}`;const cachedEntry=this.cache.get(key);
        let response;
        if(cachedEntry&&Date.now()-cachedEntry.savedAt<this.ttlMs){response=cachedEntry.response;organizationCached.push(entry.organization);}
        else{
          try{response=await this.client.listOrganizationRepositories(entry.organization,{page:currentVendorPage,perPage:100});this.cache.set(key,{savedAt:Date.now(),response});}
          catch(error){
            if(error instanceof GitHubDiscoveryError&&(error.status===403||error.status===429)){rateLimit={status:error.status,resetAt:error.resetAt??null,message:error.message};break;}
            if(error instanceof GitHubDiscoveryError&&error.status===404){unavailableOrganizations.push(entry.organization);currentVendorOffset++;currentVendorPage=1;continue;}
            apiErrors.push({organization:entry.organization,message:error instanceof Error?error.message:String(error),status:error.status??null});fatalError=true;break;
          }
        }
        addResults(response.results);
        organizationScans.push({vendor:entry.vendor,organization:entry.organization,page:currentVendorPage,count:response.count,complete:response.complete});
        if(response.complete){currentVendorOffset++;currentVendorPage=1;}
        else{currentVendorPage=response.nextPage??currentVendorPage+1;break;}
      }
      nextVendorOffset=currentVendorOffset;nextVendorPage=currentVendorPage;
    }else{
      nextVendorOffset=vendorOffset;nextVendorPage=vendorPage;
    }
    const vendorScanAvailable=!includeVendorSeeds||typeof this.client.listOrganizationRepositories==='function';
    const queryComplete=nextOffset>=unique.length;
    const vendorComplete=!includeVendorSeeds||nextVendorOffset>=organizations.length;
    const complete=queryComplete&&vendorComplete&&apiErrors.length===0&&unavailableOrganizations.length===0;
    return {
      plan,results:[...results.values()],searchedQueries:searched,cachedQueries:cached,queryReports,
      vendorOrganizationsScanned:organizationScans,vendorOrganizationsCached:organizationCached,unavailableOrganizations,
      vendorScanAvailable,failedQueries:apiErrors,rateLimit,queryBudget:this.maxQueriesPerRun,
      queryOffset,nextOffset,queryPage,nextQueryPage,remainingQueries:Math.max(0,unique.length-nextOffset),
      vendorOffset,nextVendorOffset,nextVendorPage,remainingVendorOrganizations:Math.max(0,organizations.length-nextVendorOffset),
      complete,
      status:rateLimit?'PAUSED_RATE_LIMIT':apiErrors.length||unavailableOrganizations.length?'PARTIAL_ERROR':!vendorScanAvailable?'VENDOR_SCAN_UNAVAILABLE':complete?'COMPLETE':'BATCH_COMPLETE',
      retrievedAt:new Date().toISOString(),
    };
  }
}
