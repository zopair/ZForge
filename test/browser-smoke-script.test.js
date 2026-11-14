import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('browser smoke runner parses before any browser or network setup', () => {
  const result = spawnSync(process.execPath, ['--check', 'scripts/browser-smoke.mjs'], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'browser smoke runner must be valid JavaScript before CI launches browsers: ' + result.stderr,
  );
});
