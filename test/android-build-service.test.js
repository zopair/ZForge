import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidBuildService } from '../src/runtime/android-build-service.js';

function fixture({ exitCode = 0, files = null } = {}) {
  const commands = [];
  const published = [];
  const entries = files ?? [
    { path: 'android/gradlew', type: 'file', bytes: 100 },
    { path: 'android/settings.gradle.kts', type: 'file', bytes: 50 },
    { path: 'android/build.gradle.kts', type: 'file', bytes: 80 },
    { path: 'android/app/build/outputs/apk/debug/app-debug.apk', type: 'file', bytes: 1024 },
    { path: 'android/app/build/outputs/bundle/debug/app-debug.aab', type: 'file', bytes: 2048 },
  ];
  const runtime = {
    createWorkspace: async () => ({ id: 'ws-android' }),
    listFiles: async () => entries,
    execute: async input => { commands.push(input); return { exitCode, stdout: 'BUILD FINISHED', stderr: exitCode ? 'build failed' : '' }; },
  };
  const artifactStore = {
    publishFromWorkspace: async input => {
      published.push(input);
      return { id: 'artifact-' + published.length, filename: input.filename, kind: input.kind, sha256: 'verified-hash' };
    },
  };
  return { service: new AndroidBuildService({ runtime, artifactStore }), commands, published };
}

test('Android worker runs unit tests and debug APK/AAB tasks, then publishes real output paths', async () => {
  const { service, commands, published } = fixture();
  const result = await service.build({ workspaceId: 'ws-android', projectPath: 'android', formats: ['apk', 'aab'] });
  assert.equal(result.status, 'succeeded');
  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'bash');
  assert.deepEqual(commands[0].args, ['./gradlew', '--no-daemon', 'test', 'assembleDebug', 'bundleDebug']);
  assert.equal(commands[0].cwd, 'android');
  assert.deepEqual(published.map(item => item.kind).sort(), ['aab', 'apk']);
  assert.ok(published.every(item => item.sourcePath.startsWith('android/app/build/outputs/')));
  assert.equal(result.artifacts.length, 2);
});

test('Android worker does not publish artifacts when Gradle fails', async () => {
  const { service, published } = fixture({ exitCode: 1 });
  const result = await service.build({ workspaceId: 'ws-android', projectPath: 'android', formats: ['apk'] });
  assert.equal(result.status, 'failed');
  assert.equal(result.artifacts.length, 0);
  assert.equal(published.length, 0);
});

test('Android worker rejects projects without Gradle wrapper before running commands', async () => {
  const { service, commands } = fixture({ files: [{ path: 'android/settings.gradle', type: 'file' }] });
  await assert.rejects(() => service.build({ workspaceId: 'ws-android', projectPath: 'android' }), /Gradle wrapper/i);
  assert.equal(commands.length, 0);
});

test('Android worker rejects unsafe project paths and unsupported release variants', async () => {
  const { service, commands } = fixture();
  await assert.rejects(() => service.build({ workspaceId: 'ws-android', projectPath: '../outside' }), /relative project path/i);
  await assert.rejects(() => service.build({ workspaceId: 'ws-android', projectPath: 'android', variant: 'release' }), /debug variant/i);
  assert.equal(commands.length, 0);
});

test('Android worker rejects missing APK output instead of inventing an artifact', async () => {
  const files = [
    { path: 'android/gradlew', type: 'file' },
    { path: 'android/settings.gradle', type: 'file' },
    { path: 'android/app/build/outputs/apk/debug/README.txt', type: 'file' },
  ];
  const { service, published } = fixture({ files });
  const result = await service.build({ workspaceId: 'ws-android', projectPath: 'android', formats: ['apk'] });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /APK output was not found/i);
  assert.equal(published.length, 0);
});
