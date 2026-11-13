import { readFile, lstat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { resolve, join } from 'node:path';

const MEMORY_FILES=['TOOL_REGISTRY.md','ISSUES.md','SOLUTIONS.md','FAILED_APPROACHES.md','WORKAROUNDS.md','AGENT_LEARNINGS.md','RESOURCE_LIMITS.md','COMPATIBILITY_MATRIX.md','VERSION_REGISTRY.md','DISCOVERY_RUNS.md','REJECTED_CANDIDATES.md'];
export class LocalRepositoryMemoryStore{
  constructor({rootDir,maxFileBytes=32000,maxTotalBytes=120000}={}){
    if(typeof rootDir!=='string'||!rootDir.trim())throw new TypeError('rootDir is required');
    if(!Number.isInteger(maxFileBytes)||maxFileBytes<1)throw new RangeError('maxFileBytes must be positive');
    if(!Number.isInteger(maxTotalBytes)||maxTotalBytes<1)throw new RangeError('maxTotalBytes must be positive');
    this.rootDir=resolve(rootDir);this.maxFileBytes=maxFileBytes;this.maxTotalBytes=maxTotalBytes;
  }
  async loadRelevant({request='',capabilities=[]}={}){
    const files={};const reviewedFiles=[];const missingFiles=[];const truncatedFiles=[];let remaining=this.maxTotalBytes;
    for(const name of MEMORY_FILES){
      const path=join(this.rootDir,'memory',name);
      try{
        const info=await lstat(path);
        if(info.isSymbolicLink()||!info.isFile())throw new Error('memory input must be a regular file, not a symbolic link');
        const limit=Math.min(this.maxFileBytes,remaining);
        if(limit<=0){files[name]={available:false,reason:'TOTAL_MEMORY_BUDGET_REACHED'};truncatedFiles.push(name);continue;}
        const raw=await readFile(path);
        const truncated=raw.length>limit;
        const content=raw.subarray(0,limit).toString('utf8');
        files[name]={available:true,content,truncated,bytesRead:Buffer.byteLength(content,'utf8')};
        reviewedFiles.push(name);remaining-=files[name].bytesRead;
        if(truncated||info.size>limit)truncatedFiles.push(name);
      }catch(error){
        if(error.code==='ENOENT'){files[name]={available:false,reason:'NOT_FOUND'};missingFiles.push(name);continue;}
        throw error;
      }
    }
    return {files,reviewedFiles,missingFiles,truncatedFiles,remainingBytes:remaining,request,capabilities,loadedAt:new Date().toISOString()};
  }
}
export class LocalPromptProvider{
  constructor({rootDir,maxFileBytes=64000}={}){
    if(typeof rootDir!=='string'||!rootDir.trim())throw new TypeError('rootDir is required');
    if(!Number.isInteger(maxFileBytes)||maxFileBytes<1)throw new RangeError('maxFileBytes must be positive');
    this.rootDir=resolve(rootDir);this.maxFileBytes=maxFileBytes;
  }
  async getChiefAgentPrompt(){
    const path=join(this.rootDir,'prompts','CHIEF_AGENT.md');
    const info=await lstat(path);
    if(info.isSymbolicLink()||!info.isFile())throw new Error('canonical prompt must be a regular file, not a symbolic link');
    if(info.size>this.maxFileBytes)throw new RangeError('canonical Chief Agent prompt exceeds configured size limit');
    return readFile(path,'utf8');
  }
}
