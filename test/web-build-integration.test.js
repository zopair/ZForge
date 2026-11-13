import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalExecutionRuntime } from '../src/runtime/local-execution-runtime.js';
import { LocalArtifactStore } from '../src/runtime/artifact-store.js';
import { WebBuildService } from '../src/runtime/web-build-service.js';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'zforge-web-e2e-'));
  const runtime = await new LocalExecutionRuntime({ rootDir: join(root, 'workspaces') }).initialize();
  const artifactStore = await new LocalArtifactStore({ rootDir: join(root, 'artifacts') }).initialize();
  await runtime.createWorkspace({ id: 'web-integration' });
  t.after(async () => {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root, runtime, artifactStore,
    service: new WebBuildService({ runtime, artifactStore, path: process.env.PATH, timeoutMs: 30000 }),
  };
}

test('web build worker executes real npm test/build scripts and publishes verifiable static artifacts', async t => {
  const { runtime, artifactStore, service } = await setup(t);
  await runtime.writeFile({
    workspaceId: 'web-integration',
    path: 'package.json',
    content: JSON.stringify({ name: 'zforge-web-integration', private: true, scripts: { test: 'node verify.mjs', build: 'node build.mjs' } }),
  });
  await runtime.writeFile({
    workspaceId: 'web-integration',
    path: 'verify.mjs',
    content: "if (process.env.NODE_ENV === 'never') process.exit(1); console.log('INTEGRATION TESTS PASSED');",
  });
  await runtime.writeFile({
    workspaceId: 'web-integration',
    path: 'build.mjs',
    content: "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir('dist/assets', { recursive: true }); await writeFile('dist/index.html', '<!doctype html><title>ZForge integration build</title>'); await writeFile('dist/assets/app.js', 'globalThis.zforgeBuilt = true;'); console.log('STATIC BUILD COMPLETE');",
  });

  const result = await service.build({ workspaceId: 'web-integration', projectPath: '.', outputDirectory: 'dist', runTests: true });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.commands.map(command => command.task), ['test', 'build']);
  assert.equal(result.artifacts.length, 2);
  const html = result.artifacts.find(artifact => artifact.filename === 'index.html');
  assert.ok(html);
  const verified = await artifactStore.readArtifact(html.id);
  assert.equal(verified.content.toString(), '<!doctype html><title>ZForge integration build</title>');
  assert.equal(verified.metadata.sha256, html.sha256);
  assert.equal(verified.metadata.kind, 'web');
});

test('web build integration never publishes artifacts when the real npm test command fails', async t => {
  const { runtime, artifactStore, service } = await setup(t);
  await runtime.writeFile({
    workspaceId: 'web-integration',
    path: 'package.json',
    content: JSON.stringify({ name: 'zforge-web-failing-test', private: true, scripts: { test: 'node fail.mjs', build: 'node build.mjs' } }),
  });
  await runtime.writeFile({ workspaceId: 'web-integration', path: 'fail.mjs', content: "console.error('EXPECTED TEST FAILURE'); process.exit(7);" });
  await runtime.writeFile({ workspaceId: 'web-integration', path: 'build.mjs', content: "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir('dist', { recursive: true }); await writeFile('dist/index.html', 'must not publish');" });

  const result = await service.build({ workspaceId: 'web-integration', projectPath: '.', runTests: true });

  assert.equal(result.status, 'failed');
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].task, 'test');
  assert.equal(result.commands[0].exitCode, 7);
  assert.equal(result.artifacts.length, 0);
  assert.equal(artifactStore.listArtifacts().length, 0);
});
