export class TaskScheduler {
  constructor({ taskStore, runTask, maxConcurrent = 2 } = {}) {
    if (!taskStore || typeof taskStore.get !== 'function' || typeof taskStore.list !== 'function' || typeof taskStore.transition !== 'function') {
      throw new TypeError('taskStore must provide get, list and transition');
    }
    if (typeof runTask !== 'function') throw new TypeError('runTask callback is required');
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 64) throw new RangeError('maxConcurrent must be between 1 and 64');
    this.taskStore = taskStore;
    this.runTask = runTask;
    this.maxConcurrent = maxConcurrent;
    this.started = false;
    this.queue = [];
    this.active = new Map();
    this.inflight = new Set();
  }

  async start() {
    if (this.started) return this.status();
    this.started = true;
    for (const task of this.taskStore.list()) {
      if (task.status === 'queued') this.queue.push({ taskId: task.id, options: {} });
    }
    this.#pump();
    return this.status();
  }

  async enqueue(taskId, options = {}) {
    if (!this.started) throw new Error('task scheduler is not started');
    const task = this.taskStore.get(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (task.status !== 'queued') throw new Error(`task is not queued: ${task.status}`);
    if (this.active.has(taskId) || this.queue.some(item => item.taskId === taskId)) return { accepted: true, duplicate: true, taskId };
    this.queue.push({ taskId, options: structuredClone(options) });
    this.#pump();
    return { accepted: true, duplicate: false, taskId };
  }

  async cancel(taskId, reason = 'cancelled by user') {
    const active = this.active.get(taskId);
    if (active) {
      active.controller.abort(reason);
      return { accepted: true, running: true, taskId };
    }
    const index = this.queue.findIndex(item => item.taskId === taskId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      const task = await this.taskStore.transition(taskId, 'cancelled', { error: reason, details: { source: 'scheduler' } });
      return { accepted: true, running: false, task };
    }
    const task = this.taskStore.get(taskId);
    if (task?.status === 'queued') {
      const cancelled = await this.taskStore.transition(taskId, 'cancelled', { error: reason, details: { source: 'scheduler' } });
      return { accepted: true, running: false, task: cancelled };
    }
    return { accepted: false, running: false, task };
  }

  status() {
    return { started: this.started, queued: this.queue.length, active: this.active.size, maxConcurrent: this.maxConcurrent };
  }

  async stop({ abortRunning = false, cancelQueued = false } = {}) {
    this.started = false;
    if (cancelQueued) {
      const queued = this.queue.splice(0);
      for (const item of queued) {
        const task = this.taskStore.get(item.taskId);
        if (task?.status === 'queued') await this.taskStore.transition(item.taskId, 'cancelled', { error: 'scheduler stopped', details: { source: 'shutdown' } });
      }
    }
    if (abortRunning) {
      for (const active of this.active.values()) active.controller.abort('scheduler shutdown');
    }
    await Promise.all([...this.inflight]);
    return this.status();
  }

  #pump() {
    if (!this.started) return;
    while (this.active.size < this.maxConcurrent && this.queue.length) {
      const item = this.queue.shift();
      const task = this.taskStore.get(item.taskId);
      if (!task || task.status !== 'queued') continue;
      const controller = new AbortController();
      this.active.set(item.taskId, { controller });
      const promise = this.#execute(item, task, controller);
      this.inflight.add(promise);
      promise.finally(() => {
        this.inflight.delete(promise);
        this.active.delete(item.taskId);
        this.#pump();
      });
    }
  }

  async #execute(item, task, controller) {
    try {
      await this.runTask({ taskId: item.taskId, task, options: item.options, signal: controller.signal });
    } catch (error) {
      const current = this.taskStore.get(item.taskId);
      if (current && ['queued', 'running'].includes(current.status)) {
        const status = controller.signal.aborted ? 'cancelled' : 'failed';
        await this.taskStore.transition(item.taskId, status, { error: error.message, details: { source: 'scheduler' } });
      }
    }
  }
}
