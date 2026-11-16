import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDiscoveryCursor, writeDiscoveryCursor } from '../scripts/discovery-action-context.mjs';

test('discovery cursor is persisted atomically as durable JSON for a later workflow run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zforge-cursor-'));
  const path = join(directory, 'discovery_cursor.json');
  try {
    const initial = await readDiscoveryCursor(path);
    assert.equal(initial.version, 1);
    assert.equal(initial.cursor, null);
    await writeDiscoveryCursor({ cursor: { queryIndex: 3, page: 2 } }, path);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(saved.cursor, { queryIndex: 3, page: 2 });
    assert.ok(saved.updatedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
