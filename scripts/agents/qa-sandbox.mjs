import { spawnSync } from 'node:child_process';

export function runSandbox({ command = 'npm', args = ['test'], timeout = 15 * 60 * 1000 } = {}) {
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 20 * 60 * 1000) throw new RangeError('timeout must be 1s..20m');
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: { PATH: process.env.PATH, CI: 'true', NODE_ENV: 'test' },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`SANDBOX_TESTS_FAILED:${result.status ?? 'timeout'}`);
  return { passed: true, command, args };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(JSON.stringify(runSandbox()) + '\n'); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
