const API='https://api.github.com';
const ROOT_FILES=['LICENSE','LICENSE.md','LICENSE.txt','COPYING','NOTICE','package.json','pyproject.toml','Cargo.toml','go.mod','requirements.txt','build.gradle','build.gradle.kts','README.md','SECURITY.md','Dockerfile'];
const LICENSE_NAMES=new Set(['LICENSE','LICENSE.md','LICENSE.txt','COPYING']);
const MANIFEST_NAMES=new Set(['package.json','pyproject.toml','Cargo.toml','go.mod','requirements.txt','build.gradle','build.gradle.kts']);
const SECURITY_NAMES=new Set(['SECURITY.md']);
export class GitHubInspectionError extends Error {
  constructor(message,{status=0}={}){super(message);this.name='GitHubInspectionError';this.status=status;}
}
function decodeContent(value){
  if(typeof value!=='string')return null;
  const binary=globalThis.atob?globalThis.atob(value.replace(/\s/g,'')):null;
  if(binary===null)return null;
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
export class GitHubRepositoryInspector {
  constructor({token=null,fetchImpl=globalThis.fetch,maxFiles=8}={}){
    if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
    if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>12)throw new RangeError('maxFiles must be 1..12');
    this.token=token;this.fetchImpl=fetchImpl;this.maxFiles=maxFiles;
  }
  async request(path){
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(this.token)headers.Authorization=`Bearer ${this.token}`;
    const response=await this.fetchImpl(new URL(path,API),{headers});
    if(response.status===403||response.status===429)throw new GitHubInspectionError('GitHub API rate limit reached. Stop and wait for the official reset window.',{status:response.status});
    if(response.status===404)return null;
    if(!response.ok)throw new GitHubInspectionError(`GitHub inspection failed with HTTP ${response.status}.`,{status:response.status});
    return response.json();
  }
  async inspectRepository(fullName){
    if(typeof fullName!=='string'||!/^[-\w.]+\/[-\w.]+$/.test(fullName))throw new TypeError('fullName must be owner/repository');
    const metadata=await this.request(`/repos/${fullName}`);
    if(!metadata)throw new GitHubInspectionError('Repository not found.',{status:404});
    const root=await this.request(`/repos/${fullName}/contents`);
    const available=new Map((Array.isArray(root)?root:[]).filter(item=>item.type==='file').map(item=>[item.name,item]));
    const selected=ROOT_FILES.filter(name=>available.has(name)).slice(0,this.maxFiles);
    const inspected=[];
    for(const name of selected){
      const item=available.get(name);
      const file=await this.request(`/repos/${fullName}/contents/${encodeURIComponent(name)}`);
      if(!file||file.encoding!=='base64'||!file.content)continue;
      inspected.push({name,path:file.path??name,size:file.size??item.size??null,content:decodeContent(file.content)});
    }
    const licenseFiles=inspected.filter(file=>LICENSE_NAMES.has(file.name));
    const manifests=inspected.filter(file=>MANIFEST_NAMES.has(file.name)).map(file=>({name:file.name,content:file.content}));
    const securityFiles=inspected.filter(file=>SECURITY_NAMES.has(file.name));
    const mentions=new Set();
    for(const file of manifests){
      const content=file.content??'';
      for(const marker of ['openai','anthropic','claude','gemini','vercel','netlify','cloudflare','firebase','supabase','stripe'])if(new RegExp(marker,'i').test(content))mentions.add(marker);
    }
    return {
      repository:{id:metadata.id,fullName:metadata.full_name,htmlUrl:metadata.html_url,archived:metadata.archived,defaultBranch:metadata.default_branch,pushedAt:metadata.pushed_at,license:metadata.license?{spdxId:metadata.license.spdx_id,name:metadata.license.name}:null},
      rootFilesInspected:inspected.map(file=>file.name),
      licenseFiles:licenseFiles.map(file=>({name:file.name,content:file.content})),
      dependencyManifests:manifests,
      securityFiles:securityFiles.map(file=>({name:file.name,content:file.content})),
      externalServiceMentions:[...mentions],
      inspectionStatus:'NEEDS_DEPENDENCY_AND_LICENSE_REVIEW',
      notes:['Repository metadata license is not a substitute for reading the full license text.','External-service mentions are indicators only; inspect whether each dependency is required, optional, self-hostable or paid.','Model weights, datasets, fonts and bundled assets may have separate licenses.','No repository code or install script was executed.'],
      inspectedAt:new Date().toISOString(),
    };
  }
}
