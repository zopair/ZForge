import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubDiscoveryClient, GitHubDiscoveryError } from '../src/adapters/github-discovery.js';

test('GitHub discovery requests public repositories and normalizes license metadata', async () => {
  let requested;
  const client = new GitHubDiscoveryClient({ token:'test-token', fetchImpl:async (url,init) => {
    requested={url:String(url),headers:init.headers};
    return { ok:true, status:200, json:async()=>({total_count:1,items:[{id:7,full_name:'org/tool',name:'tool',html_url:'https://github.com/org/tool',archived:false,license:{spdx_id:'MIT',name:'MIT License'},topics:['ai']}]}) };
  }});
  const result=await client.searchRepositories('agent framework',{maxResults:10});
  assert.equal(result.results[0].fullName,'org/tool');
  assert.equal(result.results[0].license.spdxId,'MIT');
  assert.equal(result.results[0].discoveryOnly,true);
  assert.match(requested.url,/search\/repositories/);
  assert.equal(requested.headers.Authorization,'Bearer test-token');
});

test('GitHub discovery stops on official rate-limit response without retrying or bypassing', async () => {
  let calls=0;
  const client=new GitHubDiscoveryClient({fetchImpl:async()=>{calls++;return{ok:false,status:403,headers:{get:()=> '1790000000'}};}});
  await assert.rejects(()=>client.searchRepositories('web framework'),error=>error instanceof GitHubDiscoveryError&&error.status===403);
  assert.equal(calls,1);
});

test('GitHub discovery validates query and bounded result limits', async () => {
  const client=new GitHubDiscoveryClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>({total_count:0,items:[]})})});
  await assert.rejects(()=>client.searchRepositories(''),/query/);
  await assert.rejects(()=>client.searchRepositories('web',{maxResults:501}),/maxResults/);
});

test('GitHub discovery can enumerate public repositories in a vendor organization',async()=>{
  let requested;
  const client=new GitHubDiscoveryClient({fetchImpl:async url=>{requested=String(url);return{ok:true,status:200,json:async()=>[{id:11,full_name:'google/project',name:'project',html_url:'https://github.com/google/project',archived:false,license:{spdx_id:'Apache-2.0',name:'Apache License 2.0'}}]};}});
  const result=await client.listOrganizationRepositories('google');
  assert.equal(result.results[0].fullName,'google/project');
  assert.match(requested,/orgs\/google\/repos/);
  assert.match(requested,/type=public/);
});
