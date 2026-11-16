import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SOURCES = [
  'scripts/agents/scavenger.mjs',
  'scripts/agents/blacksmith.mjs',
  'scripts/agents/qa-sandbox.mjs',
  'scripts/agents/healer-memory.mjs',
  'scripts/agents/resource-manager.mjs',
];

export async function replenish({ root = process.cwd() } = {}) {
  const standby = path.join(root, 'agents', 'standby');
  await mkdir(standby, { recursive: true });
  const restored = [];
  for (const source of SOURCES) {
    const target = path.join(standby, path.basename(source));
    await copyFile(path.join(root, source), target);
    restored.push(path.basename(source));
  }
  return { restored, count: restored.length, sourcePoolPreserved: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  replenish().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
