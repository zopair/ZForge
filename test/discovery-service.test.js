import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalDiscoveryService } from '../src/core/discovery-service.js';
import { GitHubDiscoveryError } from '../src/adapters/github-discovery.js';

test('discovery service enforces a bounded query budget and returns a continuation offset',async()=>{
  const seen=[];
  const client={token:null,searchRepositories:async query=>{seen.push(query);return{results:[{id:seen.length,fullName:`org/tool-${seen.length}`}]};}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:3,maxResultsPerQuery:5});
  const first=await service.discover({capabilities:['android']});
  assert.equal(seen.length,3);
  assert.equal(first.status,'BATCH_COMPLETE');
  assert.equal(first.nextOffset,3);
  assert.ok(first.remainingQueries>0);
});

test('discovery service reuses unexpired cache without making duplicate API calls',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;return{results:[{id:1,fullName:'org/cached'}]};}};
  const service=new UniversalDiscoveryService({client,cache:new Map(),maxQueriesPerRun:1,ttlMs:60000});
  const first=await service.discover({keywords:['unique-capability']});
  const second=await service.discover({keywords:['unique-capability']});
  assert.equal(calls,1);
  assert.equal(first.searchedQueries.length,1);
  assert.equal(second.cachedQueries.length,1);
});

test('discovery service pauses on rate limits and does not retry or bypass',async()=>{
  let calls=0;
  const client={searchRepositories:async()=>{calls++;throw new GitHubDiscoveryError('rate limit',{status:403,resetAt:null});}};
  const service=new UniversalDiscoveryService({client,maxQueriesPerRun:5});
  const result=await service.discover({keywords:['test']});
  assert.equal(calls,1);
  assert.equal(result.status,'PAUSED_RATE_LIMIT');
  assert.ok(result.rateLimit);
});
