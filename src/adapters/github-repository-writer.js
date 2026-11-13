import { Buffer } from 'node:buffer';
const API='https://api.github.com';
export class GitHubWriteError extends Error{
  constructor(message,{status=0}={}){super(message);this.name='GitHubWriteError';this.status=status;}
}
export class GitHubRepositoryWriter{
  constructor({repository,token,defaultBranch='main',fetchImpl=globalThis.fetch,approvalVerifier,apiBase=API,maxFileBytes=1000000}={}){
    if(typeof repository!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw new TypeError('repository must be owner/name');
    if(typeof token!=='string'||!token.trim())throw new TypeError('server-side GitHub token is required');
    if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
    if(typeof approvalVerifier!=='function')throw new TypeError('approvalVerifier is required');
    if(!Number.isInteger(maxFileBytes)||maxFileBytes<1)throw new RangeError('maxFileBytes must be positive');
    this.repository=repository;this.token=token;this.defaultBranch=defaultBranch;this.fetchImpl=fetchImpl;this.approvalVerifier=approvalVerifier;this.apiBase=apiBase.replace(/\/$/,'');this.maxFileBytes=maxFileBytes;
  }
  assertTaskBranch(branch){
    if(typeof branch!=='string'||!/^zforge\/task-[A-Za-z0-9._-]+$/.test(branch)||branch===this.defaultBranch)throw new TypeError('protected branch: writes are allowed only on zforge/task-* branches');
  }
  async request(path,{method='GET',body}={}){
    const response=await this.fetchImpl(`${this.apiBase}${path}`,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(response.status===403||response.status===429)throw new GitHubWriteError('GitHub write rate limit or permission boundary reached; stop and wait for the official reset window.',{status:response.status});
    if(response.status===404)return null;
    if(!response.ok)throw new GitHubWriteError(`GitHub write request failed with HTTP ${response.status}.`,{status:response.status});
    return response.json();
  }
  async createTaskBranch({branch,baseRef=this.defaultBranch,approval}={}){
    this.assertTaskBranch(branch);
    if(typeof baseRef!=='string'||!baseRef.trim())throw new TypeError('baseRef is required');
    const approved=await this.approvalVerifier(approval,{type:'create-branch',repository:this.repository,branch,baseRef});
    if(approved!==true||approval?.branch!==branch||approval?.baseRef!==baseRef)throw new GitHubWriteError('A valid explicit approval for this task branch and base ref is required.',{status:403});
    const ref=await this.request(`/repos/${this.repository}/git/ref/heads/${encodeURIComponent(baseRef)}`);
    const sha=ref?.object?.sha;
    if(!sha)throw new GitHubWriteError('Base ref could not be resolved.',{status:404});
    await this.request(`/repos/${this.repository}/git/refs`,{method:'POST',body:{ref:`refs/heads/${branch}`,sha}});
    return {repository:this.repository,branch,baseRef,baseSha:sha,created:true};
  }
  async putFile({branch,path,content,message,approval}={}){
    this.assertTaskBranch(branch);
    if(typeof path!=='string'||!path.trim()||path.startsWith('/')||path.split('/').some(part=>!part||part==='..')||path.includes('\\'))throw new TypeError('repository path is invalid');
    if(typeof content!=='string'||typeof message!=='string'||!message.trim())throw new TypeError('content and commit message are required');
    if(Buffer.byteLength(content,'utf8')>this.maxFileBytes)throw new RangeError('file content exceeds configured write limit');
    const action={type:'write-file',repository:this.repository,branch,path};
    const approved=await this.approvalVerifier(approval,action);
    if(approved!==true)throw new GitHubWriteError('A valid explicit approval for this branch and path is required.',{status:403});
    if(!Array.isArray(approval?.allowedPaths)||!approval.allowedPaths.includes(path)||approval.branch!==branch)throw new GitHubWriteError('Approval scope does not include this branch and path.',{status:403});
    const encodedPath=path.split('/').map(encodeURIComponent).join('/');
    const existing=await this.request(`/repos/${this.repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    const body={message,content:Buffer.from(content,'utf8').toString('base64'),branch,...(existing?.sha?{sha:existing.sha}:{})};
    const result=await this.request(`/repos/${this.repository}/contents/${encodedPath}`,{method:'PUT',body});
    if(!result?.commit?.sha)throw new GitHubWriteError('GitHub did not confirm the file commit.');
    return {repository:this.repository,branch,path,commitSha:result.commit.sha,contentSha:result.content?.sha??null,createdOrUpdated:true};
  }
}
