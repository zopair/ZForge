import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubRepositoryInspector } from '../src/adapters/github-repository-inspector.js';

const jsonResponse=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('repository inspector reads metadata and selected manifests without executing repository code',async()=>{
  const calls=[];
  const files={
    LICENSE:{path:'LICENSE',encoding:'base64',content:btoa('MIT License'),size:11},
    'package.json':{path:'package.json',encoding:'base64',content:btoa(JSON.stringify({dependencies:{react:'18.2.0',openai:'^4.0.0'}})),size:50},
    'README.md':{path:'README.md',encoding:'base64',content:btoa('# Tool'),size:6}
  };
  const fetchImpl=async url=>{const path=new URL(url).pathname;calls.push(path);
    if(path==='/repos/org/tool')return jsonResponse({id:9,full_name:'org/tool',html_url:'https://github.com/org/tool',archived:false,default_branch:'main',license:{spdx_id:'MIT',name:'MIT License'}});
    if(path==='/repos/org/tool/contents')return jsonResponse(Object.keys(files).map(name=>({name,type:'file',size:files[name].size})));
    const name=decodeURIComponent(path.split('/').pop());return files[name]?jsonResponse(files[name]):jsonResponse({},404);
  };
  const result=await new GitHubRepositoryInspector({fetchImpl}).inspectRepository('org/tool');
  assert.equal(result.repository.license.spdxId,'MIT');
  assert.equal(result.licenseFiles[0].content,'MIT License');
  assert.equal(result.dependencyManifests.length,1);
  assert.ok(result.externalServiceMentions.includes('openai'));
  assert.equal(result.inspectionStatus,'NEEDS_DEPENDENCY_AND_LICENSE_REVIEW');
  assert.ok(!calls.some(path=>path.includes('git/trees')));
});
test('repository inspector rejects malformed repository names',async()=>{
  const inspector=new GitHubRepositoryInspector({fetchImpl:async()=>jsonResponse({})});
  await assert.rejects(()=>inspector.inspectRepository('not-a-full-name'),/owner\/repository/);
});
