import { posix } from 'node:path';

const ENGINES = new Set(['podman', 'docker']);
const NETWORKS = new Set(['bridge', 'none']);

function memoryLimitMb(value) {
  const amount = Number.parseInt(value, 10);
  const unit = value.slice(-1).toLowerCase();
  return unit === 'g' ? amount * 1024 : unit === 'k' ? Math.max(1, amount / 1024) : amount;
}

export class ContainerExecutionRuntime {
  constructor({
    hostRuntime,
    engine = 'podman',
    image = 'node:24-bookworm-slim',
    network = 'bridge',
    cpuLimit = 2,
    memoryLimit = '4g',
    pidsLimit = 256,
    tmpfsSize = '512m',
  } = {}) {
    if (!hostRuntime || typeof hostRuntime.getWorkspacePath !== 'function' || typeof hostRuntime.execute !== 'function') {
      throw new TypeError('hostRuntime must provide getWorkspacePath and execute');
    }
    if (!ENGINES.has(engine)) throw new TypeError('container engine must be podman or docker');
    if (typeof image !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{1,180}$/.test(image)) throw new TypeError('container image reference is invalid');
    if (!NETWORKS.has(network)) throw new TypeError('container network must be bridge or none');
    if (!Number.isFinite(cpuLimit) || cpuLimit <= 0 || cpuLimit > 128) throw new RangeError('cpuLimit must be greater than 0 and at most 128');
    if (typeof memoryLimit !== 'string' || !/^\d+[kmg]$/i.test(memoryLimit)) throw new TypeError('memoryLimit must use k, m or g units');
    if (!Number.isInteger(pidsLimit) || pidsLimit < 16 || pidsLimit > 65536) throw new RangeError('pidsLimit must be between 16 and 65536');
    if (typeof tmpfsSize !== 'string' || !/^\d+[kmg]$/i.test(tmpfsSize)) throw new TypeError('tmpfsSize must use k, m or g units');
    this.hostRuntime = hostRuntime;
    this.engine = engine;
    this.image = image;
    this.network = network;
    this.cpuLimit = cpuLimit;
    this.memoryLimit = memoryLimit;
    this.pidsLimit = pidsLimit;
    this.tmpfsSize = tmpfsSize;
  }

  async initialize() {
    if (typeof this.hostRuntime.initialize === 'function') await this.hostRuntime.initialize();
    return this;
  }

  createWorkspace(input) { return this.hostRuntime.createWorkspace(input); }
  getWorkspacePath(input) { return this.hostRuntime.getWorkspacePath(input); }
  readFile(input) { return this.hostRuntime.readFile(input); }
  readBuffer(input) { return this.hostRuntime.readBuffer(input); }
  writeFile(input) { return this.hostRuntime.writeFile(input); }
  listFiles(input) { return this.hostRuntime.listFiles(input); }
  close() { return this.hostRuntime.close?.(); }

  async execute({ workspaceId, command, args = [], cwd = '.', env = {}, timeoutMs, resourceLimits = null } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new TypeError('command is required');
    if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new TypeError('args must be an array of strings');
    if (typeof cwd !== 'string' || !cwd.trim() || posix.isAbsolute(cwd)) throw new TypeError('container cwd must be a relative path');
    const normalizedCwd = posix.normalize(cwd);
    if (normalizedCwd === '..' || normalizedCwd.startsWith('../')) throw new TypeError('container cwd escapes workspace');
    if (!env || typeof env !== 'object' || Array.isArray(env) || Object.entries(env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string')) {
      throw new TypeError('env must be a string-valued environment object');
    }
    const workspacePath = await this.hostRuntime.getWorkspacePath({ workspaceId });
    const cpuLimit = Number.isFinite(resourceLimits?.cpu) ? Math.min(this.cpuLimit, resourceLimits.cpu) : this.cpuLimit;
    const globalMemoryMb = memoryLimitMb(this.memoryLimit);
    const memoryMb = Number.isFinite(resourceLimits?.memoryMb) ? Math.max(1, Math.min(globalMemoryMb, resourceLimits.memoryMb)) : globalMemoryMb;
    const effectiveMemory = `${Math.floor(memoryMb)}m`;
    const argsForEngine = [
      'run', '--rm', '--init',
      '--workdir', normalizedCwd === '.' ? '/workspace' : posix.join('/workspace', normalizedCwd),
      '--volume', `${workspacePath}:/workspace:rw`,
      '--cpus', String(cpuLimit),
      '--memory', effectiveMemory,
      '--pids-limit', String(this.pidsLimit),
      '--read-only',
      '--tmpfs', `/tmp:rw,nosuid,size=${this.tmpfsSize}`,
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      `--network=${this.network}`,
    ];
    argsForEngine.push('--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp', '--env', 'XDG_CACHE_HOME=/tmp/.cache');
    if (this.engine === 'podman') argsForEngine.push('--userns=keep-id');
    else if (typeof process.getuid === 'function' && typeof process.getgid === 'function') {
      argsForEngine.push('--user', `${process.getuid()}: ${process.getgid()}`.replace(' ', ''));
    }
    for (const [key, value] of Object.entries(env)) argsForEngine.push('--env', `${key}=${value}`);
    argsForEngine.push(this.image, command, ...args);
    return this.hostRuntime.execute({ workspaceId, command: this.engine, args: argsForEngine, timeoutMs, cwd: '.' });
  }
}
