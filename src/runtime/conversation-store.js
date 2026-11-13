import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_CONVERSATIONS = 500;
const MAX_MESSAGES_PER_CONVERSATION = 40;

export class ConversationStore {
  constructor({ dataDir, clock = () => new Date().toISOString() } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.filePath = join(dataDir, 'conversations.json');
    this.clock = clock;
    this.records = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(join(this.filePath, '..'), { recursive: true });
    try {
      const records = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(records)) throw new Error('conversation store must contain an array');
      for (const record of records) {
        if (!record || typeof record.id !== 'string' || !Array.isArray(record.messages)) throw new Error('conversation store contains an invalid record');
        record.messages = record.messages.filter(item =>
          item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string'
        ).slice(-MAX_MESSAGES_PER_CONVERSATION);
        this.records.set(record.id, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  create() {
    const id = randomUUID();
    this.records.set(id, { id, messages: [], createdAt: this.clock(), updatedAt: this.clock() });
    return id;
  }

  get(id) {
    if (typeof id !== 'string') return null;
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async append(id, messages) {
    if (typeof id !== 'string' || !this.records.has(id)) throw new Error('conversation_not_found');
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 2) throw new TypeError('one or two conversation messages are required');
    const normalized = messages.map(item => {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 12000) {
        throw new TypeError('conversation message is invalid');
      }
      return { role: item.role, content: item.content.trim(), at: this.clock() };
    });
    const record = this.records.get(id);
    record.messages.push(...normalized);
    record.messages = record.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    record.updatedAt = this.clock();
    await this.#persist();
    return structuredClone(record);
  }

  async #persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const records = [...this.records.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_CONVERSATIONS);
      const temporary = this.filePath + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}
