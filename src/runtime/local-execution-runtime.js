import { spawn } from 'node:child_process';
import { mkdir, realpath, lstat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export class LocalExecutionRuntime {
  constructor({ rootDir, defaultTimeoutMs = 120000, maxTimeoutMs = 900000, maxOutputBytes = 1024 * 1024, maxConcurrentProcesses = 4, killGraceMs = 1500 } = {}) {
    if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir is required');
    if (!Number.isInteger(defaultTimeoutMs) || defaultTimeoutMs < 1) throw new RangeError('defaultTimeoutMs must be positive');
    if (!Number.isInteger(maxTimeoutMs) || maxTimeoutMs < defaultTimeoutMs) throw new RangeError('maxTimeoutMs must be >= defaultTimeoutMs');
    if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024) throw new RangeError('maxOutputBytes must be >= 1024');
    if (!Number.isInteger(maxConcurrentProcesses) || maxConcurrentProcesses < 1) throw new RangeError('maxConcurrentProcesses must be positive');
    this.rootDir = resolve(rootDir);
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.maxTimeoutMs = maxTimeoutMs;
    this.maxOutputBytes = maxOutputBytes;
    this.maxConcurrentProcesses = maxConcurrentProcesses;
    this.killGraceMs = killGraceMs;
    this.activeProcesses = new Set();
  }

  async initialize() {
    await mkdir(this.rootDir, { recursive: true });
    this.rootDir = await realpath(this.rootDir);
    return this;
  }

  #workspacePath(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || id === '.' || id === '..') throw new TypeError('invalid workspace id');
    const path = resolve(this.rootDir, id);
    if (!path.startsWith(this.rootDir + sep)) throw new TypeError('workspace path escapes runtime root');
    return path;
  }

  async createWorkspace({ id } = {}) {
    const path = this.#workspacePath(id);
    await mkdir(path, { recursive: true });
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('workspace must be a real directory');
    const temporary = join(path, '.tmp');
    await mkdir(temporary, { recursive: true });
    return { id, path };
  }

  async execute({ workspaceId, command, args = [], env = {}, timeoutMs = this.defaultTimeoutMs, cwd = '.' } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new TypeError('command is required');
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('args must be an array of strings');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > this.maxTimeoutMs) throw new RangeError(`timeoutMs must be between 1 and ${this.maxTimeoutMs}`);
    if (this.activeProcesses.size >= this.maxConcurrentProcesses) throw new Error('runtime process capacity reached');
    const workspacePath = this.#workspacePath(workspaceId);
    const workspaceInfo = await lstat(workspacePath);
    if (workspaceInfo.isSymbolicLink() || !workspaceInfo.isDirectory()) throw new Error('workspace is unavailable');
    const workspaceRealPath = await realpath(workspacePath);
    const workingDirectory = resolve(workspaceRealPath, cwd);
    if (workingDirectory !== workspaceRealPath && !workingDirectory.startsWith(workspaceRealPath + sep)) throw new TypeError('execution cwd escapes workspace');
    const realWorkingDirectory = await realpath(workingDirectory);
    if (realWorkingDirectory !== workspaceRealPath && !realWorkingDirectory.startsWith(workspaceRealPath + sep)) throw new TypeError('execution cwd resolves outside workspace');
    if (typeof env !== 'object' || env === null || Array.isArray(env) || Object.entries(env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string')) throw new TypeError('env must be a string-valued environment object');
    const safeEnv = { PATH: process.env.PATH ?? '', HOME: workspacePath, TMPDIR: join(workspacePath, '.tmp'), LANG: 'C.UTF-8', ...env };
    return new Promise((resolveResult, reject) => {
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let timedOut = false;
      let settled = false;
      const child = spawn(command, args, { cwd: workingDirectory, env: safeEnv, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.add(child);
      const append = (target, chunk) => {
        const remaining = this.maxOutputBytes - outputBytes;
        if (remaining <= 0) return target;
        const text = chunk.toString('utf8');
        const accepted = Buffer.from(text).subarray(0, remaining).toString('utf8');
        outputBytes += Buffer.byteLength(accepted);
        return target + accepted;
      };
      child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
      child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, this.killGraceMs).unref();
      }, timeoutMs);
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.activeProcesses.delete(child);
        if (error) reject(error);
        else resolveResult(result);
      };
      child.once('error', error => finish(error));
      child.once('close', (exitCode, signal) => {
        if (timedOut) return finish(Object.assign(new Error(`execution timed out after ${timeoutMs}ms`), { stdout, stderr, exitCode, signal }));
        finish(null, { exitCode, signal, stdout, stderr, outputTruncated: outputBytes >= this.maxOutputBytes });
      });
    });
  }

  async close() {
    for (const child of this.activeProcesses) child.kill('SIGTERM');
  }
}
