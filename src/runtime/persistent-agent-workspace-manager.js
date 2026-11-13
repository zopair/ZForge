import { mkdir, lstat, realpath, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { AgentWorkspaceManager } from '../core/agent-workspace-manager.js';

export class PersistentAgentWorkspaceManager {
  constructor({ dataDir, clock } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) throw new TypeError('dataDir is required');
    this.dataDir = resolve(dataDir);
    this.filePath = join(this.dataDir, 'workspaces.json');
    this.manager = new AgentWorkspaceManager({ ...(clock ? { clock } : {}) });
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    const root = await lstat(this.dataDir);
    if (root.isSymbolicLink() || !root.isDirectory()) throw new Error('workspace memory root must be a regular directory, not a symbolic link');
    this.dataDir = await realpath(this.dataDir);
    this.filePath = join(this.dataDir, 'workspaces.json');
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('workspace memory must be a regular file, not a symbolic link');
      const records = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.manager.restoreWorkspaces(records);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  async #persist() {
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      const temporary = this.filePath + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify(this.manager.listWorkspaces(), null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.filePath);
    });
    await this.writeQueue;
  }

  async createWorkspace(input) {
    const result = this.manager.createWorkspace(input);
    await this.#persist();
    return result;
  }

  async getWorkspace(id) { return this.manager.getWorkspace(id); }
  async listWorkspaces(filters) { return this.manager.listWorkspaces(filters); }

  async setWorkspaceStatus(id, status) {
    const result = this.manager.setWorkspaceStatus(id, status);
    await this.#persist();
    return result;
  }

  async addObservation(id, observation) {
    const result = this.manager.addObservation(id, observation);
    await this.#persist();
    return result;
  }

  async startExperiment(workspaceId, input) {
    const result = this.manager.startExperiment(workspaceId, input);
    await this.#persist();
    return result;
  }

  async finishExperiment(workspaceId, experimentId, input) {
    const result = this.manager.finishExperiment(workspaceId, experimentId, input);
    await this.#persist();
    return result;
  }

  async promoteExperiment(workspaceId, experimentId, input) {
    const result = this.manager.promoteExperiment(workspaceId, experimentId, input);
    await this.#persist();
    return result;
  }
}
