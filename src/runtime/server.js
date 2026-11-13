import { createTaskGateway } from './task-gateway.js';
import { LocalExecutionRuntime } from './local-execution-runtime.js';

const token = process.env.ZFORGE_GATEWAY_TOKEN;
if (!token || token.length < 16) {
  process.stderr.write('ZFORGE_GATEWAY_TOKEN must be set to at least 16 characters.\n');
  process.exit(1);
}
const host = process.env.ZFORGE_HOST ?? '127.0.0.1';
const port = Number(process.env.ZFORGE_PORT ?? 8787);
const dataDir = process.env.ZFORGE_DATA_DIR ?? './.zforge-data';
const workspaceDir = process.env.ZFORGE_WORKSPACE_DIR ?? './.zforge-workspaces';
const runtime = await new LocalExecutionRuntime({ rootDir: workspaceDir }).initialize();
const gateway = createTaskGateway({ dataDir, token, runtime });

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
