import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaModelAdapter } from '../src/adapters/ollama-model-adapter.js';

test('Ollama adapter lists locally installed models without an external provider',async()=>{
  const adapter=new OllamaModelAdapter({fetchImpl:async()=>({ok:true,status:200,json:async()=>({models:[{name:'qwen3:8b'},{name:'deepseek-r1:7b'}]})})});
  const result=await adapter.listModels();
  assert.deepEqual(result,['qwen3:8b','deepseek-r1:7b']);
});
test('Ollama adapter sends non-streaming chat to the local runtime',async()=>{
  let body;
  const adapter=new OllamaModelAdapter({fetchImpl:async(url,init)=>{body=JSON.parse(init.body);return{ok:true,status:200,json:async()=>({model:'qwen3:8b',message:{content:'Plan ready'},done:true})};}});
  const result=await adapter.chat({model:'qwen3:8b',messages:[{role:'user',content:'Build a web app'}]});
  assert.equal(body.stream,false);
  assert.equal(result.content,'Plan ready');
});
test('Ollama adapter refuses remote hosts and malformed messages',async()=>{
  assert.throws(()=>new OllamaModelAdapter({baseUrl:'https://example.com'}),/loopback/i);
  const adapter=new OllamaModelAdapter({fetchImpl:async()=>({ok:true,status:200,json:async()=>({})})});
  await assert.rejects(()=>adapter.chat({model:'qwen3:8b',messages:[]}),/messages/i);
});
