import test from 'node:test';
import assert from 'node:assert/strict';
import { WebBuildService } from '../src/runtime/web-build-service.js';

function fixture({ packageJson = { name: 'sample-web', scripts: { build: 'vite build', test: 'vitest run' } }, exitCode = 0, files = null } = {}) {
  const commands = [];
  const published = [];
  const entries = files ?? [
    { path: 'app/package.json', type: 'file' },
    { path: 'app/package-lock.json', type: 'file' },
    { path: 'app/dist/index.html', type: 'file' },
    { path: 'app/dist/assets/app.js', type: 'file' },
  ];
  const runtime = {
    createWorkspace: async () => ({ id: 'web-workspace' }),
    listFiles: async () => entries,
    readBuffer: async ({ path }) => Buffer.from(JSON.stringify(packageJson)),
    execute: async input => { commands.push(input); return { exitCode, stdout: 'BUILD COMPLETE', stderr: exitCode ? 'build failed' : '' }; },
  };
  const artifactStore = {
    publishFromWorkspace: async input => {
      published.push(input);
      return { id: 'web-' + published.length, filename: input.filename, kind: input.kind, sha256: 'verified' };
    },
  };
  return { service: new WebBuildService({ runtime, artifactStore }), commands, published };
}

test('web worker runs declared tests and build script then publishes generated static files', async () => {
  const { service, commands, published } = fixture();
  const result = await service.build({ workspaceId: 'web-workspace', projectPath: 'app' });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(commands.map(item => item.args), [['run', 'test'], ['run', 'build']]);
  assert.ok(commands.every(item => item.command === 'npm' && item.cwd === 'app'));
  assert.deepEqual(published.map(item => item.sourcePath), ['app/dist/assets/app.js', 'app/dist/index.html']);
  assert.equal(result.artifacts.length, 2);
});

test('web worker does not publish output when tests or build fail', async () => {
  const { service, published } = fixture({ exitCode: 1 });
  const result = await service.build({ workspaceId: 'web-workspace', projectPath: 'app' });
  assert.equal(result.status, 'failed');
  assert.equal(result.artifacts.length, 0);
  assert.equal(published.length, 0);
});

test('web worker requires a real package build script and rejects traversal paths', async () => {
  const { service, commands } = fixture({ packageJson: { name: 'no-build', scripts: {} } });
  await assert.rejects(() => service.build({ workspaceId: 'web-workspace', projectPath: 'app' }), /build script/i);
  await assert.rejects(() => service.build({ workspaceId: 'web-workspace', projectPath: '../outside' }), /relative project path/i);
  assert.equal(commands.length, 0);
});

test('web worker selects pnpm from lockfile and supports configured static output directory', async () => {
  const { service, commands, published } = fixture({
    packageJson: { name: 'sample', scripts: { build: 'vite build' } },
    files: [
      { path: 'app/package.json', type: 'file' },
      { path: 'app/pnpm-lock.yaml', type: 'file' },
      { path: 'app/out/index.html', type: 'file' },
    ],
  });
  const result = await service.build({ workspaceId: 'web-workspace', projectPath: 'app', outputDirectory: 'out', runTests: false });
  assert.equal(result.status, 'succeeded');
  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'pnpm');
  assert.deepEqual(commands[0].args, ['run', 'build']);
  assert.equal(published[0].sourcePath, 'app/out/index.html');
});

test('web worker refuses to claim success when static output is absent', async () => {
  const { service, published } = fixture({ files: [
    { path: 'app/package.json', type: 'file' },
    { path: 'app/package-lock.json', type: 'file' },
  ] });
  const result = await service.build({ workspaceId: 'web-workspace', projectPath: 'app' });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /output directory/i);
  assert.equal(published.length, 0);
});
