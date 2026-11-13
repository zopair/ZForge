import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubReleaseMonitor } from '../src/adapters/github-release-monitor.js';

test('release monitor retrieves canonical latest release metadata',async()=>{
  const monitor=new GitHubReleaseMonitor({fetchImpl:async url=>({ok:true,status:200,json:async()=>({tag_name:'v1.4.2',html_url:'https://github.com/org/tool/releases/tag/v1.4.2',published_at:'2026-10-01T00:00:00Z',prerelease:false,draft:false})})});
  const result=await monitor.latestRelease('org/tool');
  assert.equal(result.version,'v1.4.2');
  assert.equal(result.status,'FOUND');
});
test('release monitor reports repositories without releases without inventing versions',async()=>{
  const monitor=new GitHubReleaseMonitor({fetchImpl:async()=>({ok:false,status:404,json:async()=>({})})});
  const result=await monitor.latestRelease('org/tool');
  assert.equal(result.status,'NO_RELEASE');
  assert.equal(result.version,null);
});
