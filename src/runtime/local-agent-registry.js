import { mkdir, lstat, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

export class LocalAgentRegistry {
  constructor({ dataDir } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    this.dataDir = resolve(dataDir);
    this.filePath = join(this.dataDir, 'agents.json');
    this.records = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('agent registry must be a regular file, not a symbolic link');
      const records = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(records)) throw new Error('agent registry must contain an array');
      for (const record of records) {
        if (!record?.manifest?.id || typeof record.manifest.id !== 'string') throw new Error('agent registry contains an invalid record');
        this.records.set(record.manifest.id, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  get(id) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  list() {
    return [...this.records.values()].map(record => structuredClone(record));
  }

  async save(record) {
    const id = record?.manifest?.id;
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('agent record requires manifest.id');
    this.records.set(id, structuredClone(record));
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.list(), null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.filePath);
    });
    await this.writeQueue;
    return this.get(id);
  }
}
