import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';

const ARTIFACT_KINDS = new Set(['web', 'apk', 'aab', 'aar', 'jar', 'zip', 'report', 'image', 'video', 'other']);

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value) && value !== '.' && value !== '..';
}

function validFilename(value) {
  return typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value) && value !== '.' && value !== '..';
}

export class LocalArtifactStore {
  constructor({ rootDir, maxArtifactBytes = 512 * 1024 * 1024, clock = () => new Date().toISOString() } = {}) {
    if (typeof rootDir !== 'string' || !rootDir.trim()) throw new TypeError('rootDir is required');
    if (!Number.isInteger(maxArtifactBytes) || maxArtifactBytes < 1) throw new RangeError('maxArtifactBytes must be positive');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.rootDir = resolve(rootDir);
    this.maxArtifactBytes = maxArtifactBytes;
    this.clock = clock;
    this.metadataPath = join(this.rootDir, 'artifacts.json');
    this.artifacts = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.rootDir, { recursive: true });
    const rootInfo = await lstat(this.rootDir);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('artifact root must be a regular directory, not a symbolic link');
    this.rootDir = await realpath(this.rootDir);
    this.metadataPath = join(this.rootDir, 'artifacts.json');
    try {
      const metadataInfo = await lstat(this.metadataPath);
      if (metadataInfo.isSymbolicLink() || !metadataInfo.isFile()) throw new Error('artifact metadata must be a regular file, not a symbolic link');
      const records = JSON.parse(await readFile(this.metadataPath, 'utf8'));
      if (!Array.isArray(records)) throw new Error('artifact metadata must contain an array');
      for (const record of records) {
        if (!validId(record?.id) || !validFilename(record?.filename) || !ARTIFACT_KINDS.has(record?.kind)) throw new Error('artifact metadata contains an invalid record');
        this.artifacts.set(record.id, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  async publishFromWorkspace({ runtime, workspaceId, sourcePath, filename, kind = 'other', artifactId = randomUUID(), maxBytes = this.maxArtifactBytes } = {}) {
    if (!runtime || typeof runtime.readBuffer !== 'function') throw new TypeError('runtime.readBuffer is required');
    if (!validId(artifactId)) throw new TypeError('artifact id is invalid');
    if (!validFilename(filename)) throw new TypeError('artifact filename must be a simple filename without path separators');
    if (!ARTIFACT_KINDS.has(kind)) throw new TypeError('artifact kind is unsupported');
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be positive');
    const effectiveMaxBytes = Math.min(this.maxArtifactBytes, maxBytes);
    if (this.artifacts.has(artifactId)) throw new Error(`artifact already exists: ${artifactId}`);
    const content = await runtime.readBuffer({ workspaceId, path: sourcePath, maxBytes: effectiveMaxBytes });
    if (!Buffer.isBuffer(content)) throw new TypeError('runtime.readBuffer must return a Buffer');
    if (content.length > effectiveMaxBytes) throw new RangeError('artifact exceeds configured size limit');
    const directory = join(this.rootDir, artifactId);
    await mkdir(directory);
    const filePath = join(directory, filename);
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, filePath);
      const record = {
        id: artifactId,
        filename,
        kind,
        workspaceId,
        sourcePath,
        storageKey: `${artifactId}/${filename}`,
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        createdAt: this.clock(),
      };
      this.artifacts.set(artifactId, record);
      await this.#persist();
      return structuredClone(record);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      this.artifacts.delete(artifactId);
      throw error;
    }
  }

  listArtifacts() {
    return [...this.artifacts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(record => structuredClone(record));
  }

  getArtifact(id) {
    return this.artifacts.has(id) ? structuredClone(this.artifacts.get(id)) : null;
  }

  async readArtifact(id) {
    const record = this.artifacts.get(id);
    if (!record) return null;
    const path = resolve(this.rootDir, record.storageKey);
    if (!path.startsWith(this.rootDir + sep)) throw new TypeError('artifact storage path escapes root');
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('stored artifact must be a regular file, not a symbolic link');
    const actual = await realpath(path);
    if (!actual.startsWith(this.rootDir + sep)) throw new TypeError('stored artifact resolves outside root');
    const content = await readFile(actual);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== record.sha256 || content.length !== record.sizeBytes) throw new Error('artifact integrity verification failed');
    return { metadata: structuredClone(record), content };
  }

  async #persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.metadataPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.listArtifacts(), null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.metadataPath);
    });
    return this.writeQueue;
  }
}
