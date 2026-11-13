const DEFAULT_URL='http://127.0.0.1:11434';
function localBaseUrl(value){
  let url;
  try{url=new URL(value);}catch{throw new TypeError('Ollama baseUrl must be a valid loopback URL');}
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new TypeError('Ollama adapter only permits local loopback hosts; remote model endpoints are not allowed');
  return url.toString().replace(/\/$/,'');
}
export class OllamaModelAdapter{
  constructor({baseUrl=DEFAULT_URL,fetchImpl=globalThis.fetch,timeoutMs=60000}={}){
    if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function');
    if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw new RangeError('timeoutMs must be between 1000 and 300000');
    this.baseUrl=localBaseUrl(baseUrl);this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs;
  }
  async request(path,init={}){
    const response=await this.fetchImpl(`${this.baseUrl}${path}`,{...init,signal:AbortSignal.timeout(this.timeoutMs),headers:{Accept:'application/json',...(init.headers??{})}});
    if(!response.ok)throw new Error(`Local Ollama runtime returned HTTP ${response.status}.`);
    return response.json();
  }
  async listModels(){
    const payload=await this.request('/api/tags');
    return (payload.models??[]).map(model=>model.name).filter(Boolean);
  }
  async chat({model,messages,temperature=0.1,format=null,tools=null}={}){
    if(typeof model!=='string'||!model.trim())throw new TypeError('a locally installed model name is required');
    if(!Array.isArray(messages)||messages.length===0||messages.some(message=>!message||!['system','user','assistant','tool'].includes(message.role)||typeof message.content!=='string'))throw new TypeError('messages must contain valid role/content entries');
    if(tools!==null&&(!Array.isArray(tools)||tools.some(tool=>tool?.type!=='function'||typeof tool.function?.name!=='string'||!tool.function.parameters)))throw new TypeError('tools must be valid function tool definitions');
    const payload=await this.request('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,stream:false,options:{temperature},...(format?{format}:{}),...(tools?.length?{tools}:{})})});
    const rawToolCalls=payload.message?.tool_calls??[];
    return {model:payload.model??model,content:payload.message?.content??'',toolCalls:rawToolCalls.map(call=>({name:call.function?.name??'',arguments:call.function?.arguments??{}})),rawToolCalls,done:payload.done===true,totalDuration:payload.total_duration??null,promptTokens:payload.prompt_eval_count??null,completionTokens:payload.eval_count??null};
  }
}
