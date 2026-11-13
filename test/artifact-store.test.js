import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LocalArtifactStore } from '../src/runtime/artifact-store.js';

test('artifact store preserves binary output, checksum and metadata across restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-artifacts-'));
  const bytes = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
  const runtime = { readBuffer: async () => bytes };
  try {
    const store = await new LocalArtifactStore({ rootDir: root }).initialize();
    const artifact = await store.publishFromWorkspace({ runtime, workspaceId: 'ws-build', sourcePath: 'dist/app.apk', filename: 'app.apk', kind: 'apk' });
    assert.equal(artifact.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(artifact.sizeBytes, bytes.length);
    const restored = await store.readArtifact(artifact.id);
    assert.deepEqual(restored.content, bytes);
    const reopened = await new LocalArtifactStore({ rootDir: root }).initialize();
    assert.equal((await reopened.listArtifacts())[0].id, artifact.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('artifact store rejects path-like artifact names and unsupported kinds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-artifact-invalid-'));
  try {
    const store = await new LocalArtifactStore({ rootDir: root }).initialize();
    const runtime = { readBuffer: async () => Buffer.from('x') };
    await assert.rejects(() => store.publishFromWorkspace({ runtime, workspaceId: 'ws', sourcePath: 'app.apk', filename: '../app.apk', kind: 'apk' }), /filename/i);
    await assert.rejects(() => store.publishFromWorkspace({ runtime, workspaceId: 'ws', sourcePath: 'app.apk', filename: 'app.apk', kind: 'unknown' }), /kind/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('artifact store detects tampering before returning stored bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-artifact-tamper-'));
  try {
    const store = await new LocalArtifactStore({ rootDir: root }).initialize();
    const artifact = await store.publishFromWorkspace({
      runtime: { readBuffer: async () => Buffer.from('original') },
      workspaceId: 'ws',
      sourcePath: 'dist/file.bin',
      filename: 'file.bin',
      kind: 'other',
    });
    await writeFile(join(root, artifact.storageKey), Buffer.from('tampered'));
    await assert.rejects(() => store.readArtifact(artifact.id), /integrity verification failed/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
