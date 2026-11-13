import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalDiscoveryService } from '../src/core/discovery-service.js';
import { GitHubDiscoveryError } from '../src/adapters/github-discovery.js';

test('discovery service enforces a bounded query budget and returns a continuation offset',async()=>{
  const seen=[];
  const client={token:null,searchRepositories:async query=>{seen.push(query);return{results:[{id:seen.length,fullName:`org/tool-${seen.length}`}]};}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:3,maxResultsPerQuery:5});
  const first=await service.discover({capabilities:['android'],includeVendorSeeds:false});
  assert.equal(seen.length,3);
  assert.equal(first.status,'BATCH_COMPLETE');
  assert.equal(first.nextOffset,3);
  assert.ok(first.remainingQueries>0);
});

test('discovery service reuses unexpired cache without making duplicate API calls',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;return{results:[{id:1,fullName:'org/cached'}]};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:1,ttlMs:60000});
  const first=await service.discover({keywords:['unique-capability'],includeVendorSeeds:false});
  const second=await service.discover({keywords:['unique-capability']});
  assert.equal(calls,1);
  assert.equal(first.searchedQueries.length,1);
  assert.equal(second.cachedQueries.length,1);
});

test('discovery service pauses on rate limits and does not retry or bypass',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;throw new GitHubDiscoveryError('rate limit',{status:403,resetAt:null});}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:5});
  const result=await service.discover({keywords:['test'],includeVendorSeeds:false});
  assert.equal(calls,1);
  assert.equal(result.status,'PAUSED_RATE_LIMIT');
  assert.ok(result.rateLimit);
});

test('discovery service enumerates vendor organizations in bounded batches',async()=>{
  const scanned=[];
  const client={searchRepositories:async()=>({results:[]}),listOrganizationRepositories:async org=>{scanned.push(org);return{results:[{id:org,fullName:`${org}/repo`}],count:1,complete:true};}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:1,maxVendorOrgsPerRun:2});
  const result=await service.discover({capabilities:['android'],queryOffset:0,vendorOffset:0});
  assert.equal(scanned.length,2);
  assert.equal(result.vendorOrganizationsScanned.length,2);
  assert.equal(result.nextVendorOffset,2);
  assert.ok(result.remainingVendorOrganizations>0);
});

test('discovery service resumes the same query at the next page before advancing',async()=>{
  const calls=[];
  const client={searchRepositories:async(query,{page})=>{calls.push({query,page});return page===1?{results:[{id:1,fullName:'org/one'}],complete:false,nextPage:2,totalCount:2}:{results:[{id:2,fullName:'org/two'}],complete:true,nextPage:null,totalCount:2};}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:1});
  const first=await service.discover({keywords:['pagination-case'],includeVendorSeeds:false});
  const second=await service.discover({keywords:['pagination-case'],includeVendorSeeds:false,queryOffset:first.nextOffset,queryPage:first.nextQueryPage});
  assert.equal(first.nextOffset,0);
  assert.equal(first.nextQueryPage,2);
  assert.equal(second.nextOffset,1);
  assert.equal(second.nextQueryPage,1);
  assert.deepEqual(calls.map(call=>call.page),[1,2]);
});

test('discovery skips invalid search queries without abandoning later candidates',async()=>{
  const calls=[];
  const client={searchRepositories:async query=>{calls.push(query);if(calls.length===1)throw new GitHubDiscoveryError('invalid query',{status:422});return{results:[{id:2,fullName:'org/valid'}]};}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:2});
  const result=await service.discover({keywords:['invalid-query-case'],includeVendorSeeds:false});
  assert.equal(calls.length,2);
  assert.equal(result.nextOffset,2);
  assert.equal(result.failedQueries.length,1);
  assert.equal(result.results.length,1);
});
test('discovery skips missing vendor organizations and continues the organization batch',async()=>{
  const scanned=[];
  const client={
    searchRepositories:async()=>({results:[]}),
    listOrganizationRepositories:async org=>{scanned.push(org);if(scanned.length===1)throw new GitHubDiscoveryError('not found',{status:404});return{results:[{id:2,fullName:`${org}/repo`}],count:1,complete:true};}
  };
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:1,maxVendorOrgsPerRun:2});
  const result=await service.discover({capabilities:['android'],vendorOffset:0});
  assert.equal(scanned.length,2);
  assert.equal(result.unavailableOrganizations.length,1);
  assert.equal(result.nextVendorOffset,2);
});
