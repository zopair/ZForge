import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalRepositoryMemoryStore, LocalPromptProvider } from '../src/adapters/local-repository-memory-store.js';

test('local memory store loads canonical engineering memory and reports missing files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'zforge-memory-'));
  try{
    await mkdir(join(root,'memory'),{recursive:true});
    await writeFile(join(root,'memory','TOOL_REGISTRY.md'),'Registry data');
    const store=new LocalRepositoryMemoryStore({rootDir:root});
    const result=await store.loadRelevant({request:'build android',capabilities:['android']});
    assert.equal(result.files['TOOL_REGISTRY.md'].content,'Registry data');
    assert.equal(result.files['ISSUES.md'].available,false);
    assert.equal(result.reviewedFiles.includes('TOOL_REGISTRY.md'),true);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('local prompt provider reads the canonical Chief Agent instructions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'zforge-prompt-'));
  try{
    await mkdir(join(root,'prompts'),{recursive:true});
    await writeFile(join(root,'prompts','CHIEF_AGENT.md'),'Canonical policy');
    const provider=new LocalPromptProvider({rootDir:root});
    assert.equal(await provider.getChiefAgentPrompt(),'Canonical policy');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('memory store rejects unsafe file size configuration',()=>{
  assert.throws(()=>new LocalRepositoryMemoryStore({rootDir:'/tmp',maxFileBytes:0}),/maxFileBytes/);
});
