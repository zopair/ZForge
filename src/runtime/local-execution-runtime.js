import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, realpath, lstat, readdir, readFile as fsReadFile, writeFile as fsWriteFile, rename } from 'node:fs/promises';
import { resolve, join, sep, dirname, relative, isAbsolute } from 'node:path';

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

  async getWorkspacePath({ workspaceId } = {}) {
    const path = this.#workspacePath(workspaceId);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('workspace is unavailable or is a symbolic link');
    const actual = await realpath(path);
    if (actual !== this.rootDir && !actual.startsWith(this.rootDir + sep)) throw new TypeError('workspace resolves outside runtime root');
    return actual;
  }

  async readBuffer({ workspaceId, path, maxBytes = 512 * 1024 * 1024 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be positive');
    const { workspaceRealPath, target } = await this.#resolveFilePath(workspaceId, path);
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('workspace artifact must be a regular file, not a symbolic link');
    const actual = await realpath(target);
    if (actual !== workspaceRealPath && !actual.startsWith(workspaceRealPath + sep)) throw new TypeError('artifact resolves outside workspace');
    if (info.size > maxBytes) throw new RangeError('workspace artifact exceeds read limit');
    return fsReadFile(actual);
  }

  async #resolveFilePath(workspaceId, filePath) {
    if (typeof filePath !== 'string' || !filePath.trim() || isAbsolute(filePath)) throw new TypeError('file path must be a non-empty relative path');
    const workspacePath = this.#workspacePath(workspaceId);
    const workspaceRealPath = await realpath(workspacePath);
    const target = resolve(workspaceRealPath, filePath);
    if (target !== workspaceRealPath && !target.startsWith(workspaceRealPath + sep)) throw new TypeError('file path escapes workspace');
    return { workspaceRealPath, target };
  }

  async #ensureWorkspaceDirectory(workspaceRealPath, directory) {
    const segments = relative(workspaceRealPath, directory).split(sep).filter(Boolean);
    let current = workspaceRealPath;
    for (const segment of segments) {
      current = join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('workspace parent must not contain symbolic links or non-directory entries');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await mkdir(current);
      }
      const actual = await realpath(current);
      if (actual !== workspaceRealPath && !actual.startsWith(workspaceRealPath + sep)) throw new TypeError('workspace parent resolves outside workspace');
      current = actual;
    }
    return current;
  }

  async readFile({ workspaceId, path, maxBytes = 256 * 1024 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be positive');
    const { workspaceRealPath, target } = await this.#resolveFilePath(workspaceId, path);
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('workspace file must be a regular file, not a symbolic link');
    const actual = await realpath(target);
    if (actual !== workspaceRealPath && !actual.startsWith(workspaceRealPath + sep)) throw new TypeError('file resolves outside workspace');
    if (info.size > maxBytes) throw new RangeError('workspace file exceeds read limit');
    return { path: relative(workspaceRealPath, actual), content: await fsReadFile(actual, 'utf8'), bytes: info.size };
  }

  async writeFile({ workspaceId, path, content, maxBytes = 256 * 1024 } = {}) {
    if (typeof content !== 'string') throw new TypeError('file content must be a string');
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || Buffer.byteLength(content) > maxBytes) throw new RangeError('workspace file exceeds write limit');
    const { workspaceRealPath, target } = await this.#resolveFilePath(workspaceId, path);
    const parent = dirname(target);
    const realParent = await this.#ensureWorkspaceDirectory(workspaceRealPath, parent);
    try {
      const existing = await lstat(target);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('workspace target must be a regular file, not a symbolic link');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temporary = join(realParent, `.${randomUUID()}.tmp`);
    await fsWriteFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
    return { path: relative(workspaceRealPath, target), bytes: Buffer.byteLength(content) };
  }

  async listFiles({ workspaceId, path = '.', maxEntries = 500 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 5000) throw new RangeError('maxEntries must be between 1 and 5000');
    const { workspaceRealPath, target } = await this.#resolveFilePath(workspaceId, path);
    const rootInfo = await lstat(target);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('workspace directory must be a real directory, not a symbolic link');
    const entries = [];
    const visit = async (directory, prefix) => {
      const children = await readdir(directory, { withFileTypes: true });
      for (const child of children) {
        if (entries.length >= maxEntries) return;
        if (prefix === '' && child.name === '.tmp') continue;
        const childPath = join(directory, child.name);
        if (child.isSymbolicLink()) throw new Error('workspace listing encountered a symbolic link');
        const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
        if (child.isDirectory()) {
          entries.push({ path: relativePath, type: 'directory' });
          await visit(childPath, relativePath);
        } else if (child.isFile()) {
          const info = await lstat(childPath);
          entries.push({ path: relativePath, type: 'file', bytes: info.size });
        }
      }
    };
    await visit(target, path === '.' ? '' : relative(workspaceRealPath, target));
    return entries;
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
