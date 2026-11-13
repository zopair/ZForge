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

test('Ollama adapter forwards tool schemas and exposes model tool calls', async () => {
  let requestBody;
  const adapter = new OllamaModelAdapter({
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true, status: 200,
        json: async () => ({
          model: 'qwen3:8b',
          message: { content: '', tool_calls: [{ function: { name: 'run_command', arguments: { command: 'node', args: ['--version'] } } }] },
          done: true,
        }),
      };
    },
  });
  const tools = [{ type: 'function', function: { name: 'run_command', parameters: { type: 'object' } } }];
  const result = await adapter.chat({ model: 'qwen3:8b', messages: [{ role: 'user', content: 'run a command' }], tools });
  assert.deepEqual(requestBody.tools, tools);
  assert.equal(result.toolCalls[0].name, 'run_command');
  assert.deepEqual(result.toolCalls[0].arguments, { command: 'node', args: ['--version'] });
});

test('Ollama chat propagates task cancellation to the local model request', async () => {
  const controller = new AbortController();
  const adapter = new OllamaModelAdapter({
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  const request = adapter.chat({ model: 'qwen3:8b', messages: [{ role: 'user', content: 'cancel me' }], signal: controller.signal });
  controller.abort('user cancelled');
  await assert.rejects(request, error => error.name === 'AbortError');
});
