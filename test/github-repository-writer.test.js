import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubRepositoryWriter } from '../src/adapters/github-repository-writer.js';

test('repository writer creates task branches only under the task namespace',async()=>{
  const calls=[];
  const writer=new GitHubRepositoryWriter({repository:'org/repo',token:'server-secret',defaultBranch:'main',approvalVerifier:async()=>true,fetchImpl:async(url,init)=>{calls.push({url:String(url),method:init.method??'GET',body:init.body});return init.method==='POST'?{ok:true,status:201,json:async()=>({ref:'refs/heads/zforge/task-123'})}:{ok:true,status:200,json:async()=>({object:{sha:'base-sha'}})};}});
  const result=await writer.createTaskBranch({branch:'zforge/task-123',baseRef:'main',approval:{approved:true,branch:'zforge/task-123',baseRef:'main'}});
  assert.equal(result.branch,'zforge/task-123');
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls[1].body).sha,'base-sha');
});
test('repository writer requires verified explicit approval and refuses main writes',async()=>{
  const writer=new GitHubRepositoryWriter({repository:'org/repo',token:'server-secret',defaultBranch:'main',approvalVerifier:async()=>false,fetchImpl:async()=>{throw new Error('network must not be called');}});
  await assert.rejects(()=>writer.putFile({branch:'zforge/task-123',path:'README.md',content:'x',message:'x',approval:{}}),/approval/i);
  await assert.rejects(()=>writer.putFile({branch:'main',path:'README.md',content:'x',message:'x',approval:{}}),/protected/i);
});
test('repository writer commits approved UTF-8 file content to the authorized task branch',async()=>{
  const calls=[];
  const writer=new GitHubRepositoryWriter({repository:'org/repo',token:'server-secret',defaultBranch:'main',approvalVerifier:async(approval,action)=>approval.approved===true&&approval.branch===action.branch&&approval.allowedPaths.includes(action.path),fetchImpl:async(url,init)=>{calls.push({url:String(url),method:init.method??'GET',body:init.body});if(!init.method)return{ok:false,status:404,json:async()=>({})};return{ok:true,status:201,json:async()=>({commit:{sha:'commit-sha'},content:{sha:'blob-sha'}})};}});
  const result=await writer.putFile({branch:'zforge/task-123',path:'docs/العربية.md',content:'مرحبا',message:'add Arabic docs',approval:{approved:true,branch:'zforge/task-123',allowedPaths:['docs/العربية.md']}});
  assert.equal(result.commitSha,'commit-sha');
  assert.equal(calls[1].method,'PUT');
  assert.ok(JSON.parse(calls[1].body).content);
});

test('repository writer requires approval before creating a task branch',async()=>{
  const writer=new GitHubRepositoryWriter({repository:'org/repo',token:'server-secret',defaultBranch:'main',approvalVerifier:async()=>false,fetchImpl:async()=>{throw new Error('network must not be called');}});
  await assert.rejects(()=>writer.createTaskBranch({branch:'zforge/task-456',baseRef:'main',approval:{}}),/approval/i);
});
