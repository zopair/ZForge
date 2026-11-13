const API='https://api.github.com';
export class GitHubReleaseMonitor {
  constructor({token=null,fetchImpl=globalThis.fetch}={}){
    if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
    this.token=token;this.fetchImpl=fetchImpl;
  }
  async latestRelease(fullName){
    if(typeof fullName!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(fullName))throw new TypeError('fullName must be owner/repository');
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(this.token)headers.Authorization=`Bearer ${this.token}`;
    const response=await this.fetchImpl(new URL(`/repos/${fullName}/releases/latest`,API),{headers});
    if(response.status===403||response.status===429)throw new Error('GitHub API rate limit reached; stop and wait for the official reset window.');
    if(response.status===404)return {status:'NO_RELEASE',repository:fullName,version:null,source:'GitHub Releases API'};
    if(!response.ok)throw new Error(`GitHub release lookup failed with HTTP ${response.status}.`);
    const release=await response.json();
    return {status:'FOUND',repository:fullName,version:release.tag_name??null,name:release.name??null,url:release.html_url??null,publishedAt:release.published_at??null,prerelease:release.prerelease===true,draft:release.draft===true,source:'GitHub Releases API',retrievedAt:new Date().toISOString()};
  }
}
