import { createTaskGateway } from './task-gateway.js';
import { LocalExecutionRuntime } from './local-execution-runtime.js';
import { ContainerExecutionRuntime } from './container-execution-runtime.js';
import { LocalArtifactStore } from './artifact-store.js';
import { AndroidBuildService } from './android-build-service.js';
import { WebBuildService } from './web-build-service.js';
import { WebBrowserVerificationService } from './web-browser-verification-service.js';
import { LocalVoiceService } from './local-voice-service.js';
import { OllamaModelAdapter } from '../adapters/ollama-model-adapter.js';
import { AgentExecutionService } from '../core/agent-execution-service.js';
import { ChiefAgent } from '../core/chief-agent.js';
import { AgentFactory } from '../core/agent-factory.js';
import { MultiAgentCoordinator } from '../core/multi-agent-coordinator.js';
import { LocalAgentRegistry } from './local-agent-registry.js';
import { PersistentAgentWorkspaceManager } from './persistent-agent-workspace-manager.js';
import { UniversalDiscoveryService } from '../core/discovery-service.js';
import { GitHubDiscoveryClient } from '../adapters/github-discovery.js';
import { LocalRepositoryMemoryStore, LocalPromptProvider } from '../adapters/local-repository-memory-store.js';
import { LocalTaskHistoryMemoryStore, CompositeMemoryStore } from '../adapters/local-task-history-memory-store.js';
import { EngineeringIssueLedger } from '../adapters/engineering-issue-ledger.js';

const token = process.env.ZFORGE_GATEWAY_TOKEN;
if (!token || token.length < 16) {
  process.stderr.write('ZFORGE_GATEWAY_TOKEN must be set to at least 16 characters.\n');
  process.exit(1);
}
const host = process.env.ZFORGE_HOST ?? '127.0.0.1';
const port = Number(process.env.ZFORGE_PORT ?? 8787);
const dataDir = process.env.ZFORGE_DATA_DIR ?? './.zforge-data';
const workspaceDir = process.env.ZFORGE_WORKSPACE_DIR ?? './.zforge-workspaces';
const artifactDir = process.env.ZFORGE_ARTIFACT_DIR ?? './.zforge-artifacts';
const repositoryRoot = process.env.ZFORGE_REPO_ROOT ?? process.cwd();
const model = process.env.ZFORGE_MODEL ?? 'qwen3:8b';
const allowedOrigins = (process.env.ZFORGE_ALLOWED_ORIGINS ?? 'https://zopair.github.io').split(',').map(value => value.trim()).filter(Boolean);
const hostRuntime = await new LocalExecutionRuntime({ rootDir: workspaceDir }).initialize();
const executionBackend = process.env.ZFORGE_EXECUTION_BACKEND ?? 'local';
if (!['local', 'container'].includes(executionBackend)) throw new TypeError('ZFORGE_EXECUTION_BACKEND must be local or container');
const runtime = executionBackend === 'container'
  ? await new ContainerExecutionRuntime({
      hostRuntime,
      engine: process.env.ZFORGE_CONTAINER_ENGINE ?? 'podman',
      image: process.env.ZFORGE_CONTAINER_IMAGE ?? 'node:24-bookworm-slim',
      network: process.env.ZFORGE_CONTAINER_NETWORK ?? 'bridge',
      cpuLimit: Number(process.env.ZFORGE_CONTAINER_CPUS ?? 2),
      memoryLimit: process.env.ZFORGE_CONTAINER_MEMORY ?? '4g',
      pidsLimit: Number(process.env.ZFORGE_CONTAINER_PIDS ?? 256),
    }).initialize()
  : hostRuntime;
const artifactStore = await new LocalArtifactStore({ rootDir: artifactDir }).initialize();
const androidBuildPath = executionBackend === 'container' ? null : process.env.PATH ?? null;
const androidBuildService = new AndroidBuildService({
  runtime,
  artifactStore,
  androidHome: process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? null,
  javaHome: process.env.JAVA_HOME ?? null,
  path: androidBuildPath,
  timeoutMs: Number(process.env.ZFORGE_ANDROID_BUILD_TIMEOUT_MS ?? 840000),
});
const webBuildService = new WebBuildService({ runtime, artifactStore, path: process.env.PATH ?? null, timeoutMs: Number(process.env.ZFORGE_WEB_BUILD_TIMEOUT_MS ?? 840000) });
const webBrowserVerificationService = new WebBrowserVerificationService({ runtime, timeoutMs: Number(process.env.ZFORGE_BROWSER_VERIFY_TIMEOUT_MS ?? 30000) });
const voiceService = new LocalVoiceService({
  whisperCommand: process.env.ZFORGE_WHISPER_BIN ?? 'whisper-cli',
  whisperModelPath: process.env.ZFORGE_WHISPER_MODEL ?? null,
  ffmpegCommand: process.env.ZFORGE_FFMPEG_BIN ?? 'ffmpeg',
  piperCommand: process.env.ZFORGE_PIPER_BIN ?? 'python3',
  piperModelPath: process.env.ZFORGE_PIPER_MODEL ?? null,
  kemetonePythonCommand: process.env.ZFORGE_KEMETONE_PYTHON ?? 'python3',
  kemetoneModelDir: process.env.ZFORGE_KEMETONE_DIR ?? null,
  kemetoneEspeakCommand: process.env.ZFORGE_KEMETONE_ESPEAK_BIN ?? 'espeak-ng',
  kemetoneEspeakLib: process.env.ZFORGE_KEMETONE_ESPEAK_LIB ?? null,
  kemetoneTimeoutMs: Number(process.env.ZFORGE_KEMETONE_TIMEOUT_MS ?? 300000),
  timeoutMs: Number(process.env.ZFORGE_VOICE_TIMEOUT_MS ?? 120000),
});
const modelAdapter = new OllamaModelAdapter({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434' });
const workspaceManager = await new PersistentAgentWorkspaceManager({ dataDir }).initialize();
const agentService = new AgentExecutionService({ modelAdapter, runtime, workspaceManager, artifactStore, maxSteps: Number(process.env.ZFORGE_AGENT_MAX_STEPS ?? 16) });
const discoveryClient = new GitHubDiscoveryClient({ token: process.env.GITHUB_TOKEN ?? null });
const discoveryService = new UniversalDiscoveryService({ client: discoveryClient });
const repositoryMemoryStore = new LocalRepositoryMemoryStore({ rootDir: repositoryRoot });
const taskHistoryMemoryStore = new LocalTaskHistoryMemoryStore({ dataDir });
const engineeringIssueLedger = await new EngineeringIssueLedger({ dataDir }).initialize();
const memoryStore = new CompositeMemoryStore({ stores: [repositoryMemoryStore, taskHistoryMemoryStore, engineeringIssueLedger] });
const promptProvider = new LocalPromptProvider({ rootDir: repositoryRoot });
const chiefAgent = new ChiefAgent({ modelAdapter, discoveryService, memoryStore, promptProvider, model });
const agentRegistry = await new LocalAgentRegistry({ dataDir }).initialize();
const agentFactory = new AgentFactory({ registry: agentRegistry });
const multiAgentCoordinator = new MultiAgentCoordinator({ agentFactory, agentService, maxParallel: Number(process.env.ZFORGE_MAX_PARALLEL_AGENTS ?? 3), defaultModel: model });
const gateway = createTaskGateway({ dataDir, token, runtime, agentService, chiefAgent, agentFactory, multiAgentCoordinator, androidBuildService, webBuildService, webBrowserVerificationService, voiceService, artifactStore, engineeringIssueLedger, defaultModel: model, allowedOrigins });

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
