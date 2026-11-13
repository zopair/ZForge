import { lstat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export class LocalTaskHistoryMemoryStore {
  constructor({ dataDir, maxTasks = 12, maxFileBytes = 4 * 1024 * 1024 } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 100) throw new RangeError('maxTasks must be between 1 and 100');
    if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1024) throw new RangeError('maxFileBytes must be at least 1024');
    this.filePath = join(resolve(dataDir), 'tasks.json');
    this.maxTasks = maxTasks;
    this.maxFileBytes = maxFileBytes;
  }

  async loadRelevant({ request = '', capabilities = [] } = {}) {
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('task history ledger must be a regular file, not a symbolic link');
      if (info.size > this.maxFileBytes) throw new RangeError('task history ledger exceeds configured read limit');
      const records = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(records)) throw new TypeError('task history ledger must contain an array');
      const taskHistory = records
        .filter(task => ['succeeded', 'failed', 'inconclusive', 'cancelled'].includes(task?.status))
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
        .slice(0, this.maxTasks)
        .map(task => ({
          id: task.id,
          status: task.status,
          request: String(task.request ?? '').slice(0, 2000),
          summary: task.result?.summary ?? task.result?.message ?? null,
          error: task.error ?? null,
          tools: (task.result?.trace ?? []).slice(0, 40).map(item => ({ name: item.name, ok: item.ok === true })),
          updatedAt: task.updatedAt ?? null,
        }));
      return { taskHistory, request, capabilities };
    } catch (error) {
      if (error.code === 'ENOENT') return { taskHistory: [], request, capabilities };
      throw error;
    }
  }
}

export class CompositeMemoryStore {
  constructor({ stores } = {}) {
    if (!Array.isArray(stores) || stores.length === 0 || stores.some(store => typeof store?.loadRelevant !== 'function')) {
      throw new TypeError('stores must contain one or more memory providers');
    }
    this.stores = [...stores];
  }

  async loadRelevant(input = {}) {
    const sources = await Promise.all(this.stores.map(store => store.loadRelevant(input)));
    return { sources };
  }
}
