import { createTaskGateway } from './task-gateway.js';
import { LocalExecutionRuntime } from './local-execution-runtime.js';
import { OllamaModelAdapter } from '../adapters/ollama-model-adapter.js';
import { AgentExecutionService } from '../core/agent-execution-service.js';

const token = process.env.ZFORGE_GATEWAY_TOKEN;
if (!token || token.length < 16) {
  process.stderr.write('ZFORGE_GATEWAY_TOKEN must be set to at least 16 characters.\n');
  process.exit(1);
}
const host = process.env.ZFORGE_HOST ?? '127.0.0.1';
const port = Number(process.env.ZFORGE_PORT ?? 8787);
const dataDir = process.env.ZFORGE_DATA_DIR ?? './.zforge-data';
const workspaceDir = process.env.ZFORGE_WORKSPACE_DIR ?? './.zforge-workspaces';
const model = process.env.ZFORGE_MODEL ?? 'qwen3:8b';
const allowedOrigins = (process.env.ZFORGE_ALLOWED_ORIGINS ?? 'https://zopair.github.io').split(',').map(value => value.trim()).filter(Boolean);
const runtime = await new LocalExecutionRuntime({ rootDir: workspaceDir }).initialize();
const modelAdapter = new OllamaModelAdapter({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434' });
const agentService = new AgentExecutionService({ modelAdapter, runtime, maxSteps: Number(process.env.ZFORGE_AGENT_MAX_STEPS ?? 16) });
const gateway = createTaskGateway({ dataDir, token, runtime, agentService, defaultModel: model, allowedOrigins });

await gateway.ready;
gateway.server.listen(port, host, () => {
  process.stdout.write(`ZForge Task Gateway listening on http://${host}:${port}\n`);
});
const shutdown = async () => {
  await runtime.close();
  gateway.server.close(() => process.exit(0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
