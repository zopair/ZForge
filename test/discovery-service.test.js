import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalDiscoveryService } from '../src/core/discovery-service.js';
import { GitHubDiscoveryError } from '../src/adapters/github-discovery.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('discovery service enforces a bounded query budget and returns a continuation offset',async()=>{
  const seen=[];
  const client={token:null,searchRepositories:async query=>{seen.push(query);return{results:[{id:seen.length,fullName:`org/tool-${seen.length}`}]};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:3,maxResultsPerQuery:5});
  const first=await service.discover({capabilities:['android'],includeVendorSeeds:false});
  assert.equal(seen.length,3);
  assert.equal(first.status,'BATCH_COMPLETE');
  assert.equal(first.nextOffset,3);
  assert.ok(first.remainingQueries>0);
});

test('discovery service reuses unexpired cache without making duplicate API calls',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;return{results:[{id:1,fullName:'org/cached'}]};}};
  const cache=new Map();
  const service=new UniversalDiscoveryService({client,cache,maxQueriesPerRun:1,ttlMs:60000});
  const first=await service.discover({keywords:['unique-capability'],includeVendorSeeds:false});
  const second=await service.discover({keywords:['unique-capability']});
  assert.equal(calls,1);
  assert.equal(first.searchedQueries.length,1);
  assert.equal(second.cachedQueries.length,1);
});

test('discovery service pauses on rate limits and does not retry or bypass',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;throw new GitHubDiscoveryError('rate limit',{status:403,resetAt:null});}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:5});
  const result=await service.discover({keywords:['test'],includeVendorSeeds:false});
  assert.equal(calls,1);
  assert.equal(result.status,'PAUSED_RATE_LIMIT');
  assert.ok(result.rateLimit);
});

test('discovery service enumerates vendor organizations in bounded batches',async()=>{
  const scanned=[];
  const client={searchRepositories:async()=>({results:[]}),listOrganizationRepositories:async org=>{scanned.push(org);return{results:[{id:org,fullName:`${org}/repo`}],count:1,complete:true};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:1,maxVendorOrgsPerRun:2});
  const result=await service.discover({capabilities:['android'],queryOffset:0,vendorOffset:0});
  assert.equal(scanned.length,2);
  assert.equal(result.vendorOrganizationsScanned.length,2);
  assert.equal(result.nextVendorOffset,2);
  assert.ok(result.remainingVendorOrganizations>0);
});

test('discovery service resumes the same query at the next page before advancing',async()=>{
  const calls=[];
  const client={searchRepositories:async(query,{page})=>{calls.push({query,page});return page===1?{results:[{id:1,fullName:'org/one'}],complete:false,nextPage:2,totalCount:2}:{results:[{id:2,fullName:'org/two'}],complete:true,nextPage:null,totalCount:2};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:1});
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
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:2});
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
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:1,maxVendorOrgsPerRun:2});
  const result=await service.discover({capabilities:['android'],vendorOffset:0});
  assert.equal(scanned.length,2);
  assert.equal(result.unavailableOrganizations.length,1);
  assert.equal(result.nextVendorOffset,2);
});

test('discovery persists query cache and repository ledger across service instances', async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'zforge-discovery-'));
  const cachePath=path.join(directory,'discovery_cache.json');
  let calls=0;
  const client={requestsPerOperation:2,searchRepositories:async()=>{calls++;return{results:[{id:9,fullName:'org/persisted'}]};}};
  try {
    const first=new UniversalDiscoveryService({client,cachePath,maxApiRequestsPerRun:2,maxQueriesPerRun:1});
    await first.discover({keywords:['durable-ledger-test'],includeVendorSeeds:false});
    const saved=JSON.parse(await readFile(cachePath,'utf8'));
    assert.ok(saved.visitedRepositories.includes('org/persisted'));
    const second=new UniversalDiscoveryService({client,cachePath,maxApiRequestsPerRun:2,maxQueriesPerRun:1});
    const result=await second.discover({keywords:['durable-ledger-test'],includeVendorSeeds:false});
    assert.equal(calls,1);
    assert.equal(result.cachedQueries.length,1);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('discovery never exceeds the configured total API request budget', async () => {
  let calls=0;
  const client={requestsPerOperation:2,searchRepositories:async()=>{calls++;return{results:[]};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxApiRequestsPerRun:4,maxQueriesPerRun:25});
  const result=await service.discover({keywords:['bounded-budget'],includeVendorSeeds:false});
  assert.equal(calls,2);
  assert.equal(result.apiRequests,4);
  assert.equal(result.apiRequestBudget,4);
});

test('discovery checkpoints and exits successfully on an adapter safe halt', async () => {
  const client={requestsPerOperation:2,searchRepositories:async()=>{throw new GitHubDiscoveryError('quota below threshold',{safeHalt:true,remaining:2,limit:30,resource:'search',apiRequests:1});}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxApiRequestsPerRun:10,maxQueriesPerRun:5});
  const result=await service.discover({keywords:['safe-stop-case'],includeVendorSeeds:false});
  assert.equal(result.status,'GRACEFUL_HALT');
  assert.equal(result.safeHalt,true);
  assert.equal(result.nextOffset,0);
});

test('discovery service reports actual shared Octokit budget, including preflight, not estimated per-query cost', async () => {
  const { GlobalApiBudget } = await import('../src/core/global-api-budget.js');
  const budget = new GlobalApiBudget({ maxRequests: 5 });
  let queries = 0;
  const apiClient = { budget };
  const client = {
    apiClient,
    searchRepositories: async () => {
      if (budget.used === 0) budget.consume({ url: '/rate_limit' });
      budget.consume({ url: '/search/repositories' });
      queries += 1;
      return { results: [{ id: queries, fullName: `org/shared-${queries}` }] };
    },
  };
  const service = new UniversalDiscoveryService({ client, cache: new Map(), maxApiRequestsPerRun: 5, maxQueriesPerRun: 10 });
  const result = await service.discover({ keywords: ['shared-global-budget'], includeVendorSeeds: false });
  assert.equal(result.apiRequests, 5);
  assert.equal(result.apiRequestBudget, 5);
  assert.equal(queries, 4);
  assert.equal(budget.snapshot().used, 5);
});
