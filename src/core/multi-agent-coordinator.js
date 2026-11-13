function validatePlan({ workspaceId, tasks } = {}) {
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) throw new TypeError('workspaceId is required');
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 32) throw new RangeError('tasks must contain between 1 and 32 entries');
  const ids = new Set();
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new TypeError('each task must be an object');
    if (typeof task.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(task.id)) throw new TypeError('task id is invalid');
    if (ids.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (typeof task.agentId !== 'string' || !task.agentId.trim()) throw new TypeError(`agentId is required for task ${task.id}`);
    if (typeof task.request !== 'string' || !task.request.trim()) throw new TypeError(`request is required for task ${task.id}`);
    if (task.dependsOn !== undefined && (!Array.isArray(task.dependsOn) || task.dependsOn.some(id => typeof id !== 'string'))) throw new TypeError(`dependsOn must be an array for task ${task.id}`);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) throw new Error(`unknown dependency ${dependency} for task ${task.id}`);
      if (dependency === task.id) throw new Error(`task dependency cycle includes ${task.id}`);
    }
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) throw new Error('task dependency cycle detected');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

export class MultiAgentCoordinator {
  constructor({ agentFactory, agentService, maxParallel = 3, defaultModel = 'qwen3:8b' } = {}) {
    if (!agentFactory || typeof agentFactory.getExecutionProfile !== 'function') throw new TypeError('agentFactory.getExecutionProfile is required');
    if (!agentService || typeof agentService.runTask !== 'function') throw new TypeError('agentService.runTask is required');
    if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 16) throw new RangeError('maxParallel must be between 1 and 16');
    this.agentFactory = agentFactory;
    this.agentService = agentService;
    this.maxParallel = maxParallel;
    if (typeof defaultModel !== 'string' || !defaultModel.trim()) throw new TypeError('defaultModel is required');
    this.defaultModel = defaultModel;
  }

  async executePlan({ workspaceId, tasks, onProgress = null } = {}) {
    validatePlan({ workspaceId, tasks });
    if (onProgress !== null && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function');
    const emitProgress = async (type, details = {}) => { if (onProgress) await onProgress({ type, details }); };
    const pending = new Map(tasks.map(task => [task.id, structuredClone(task)]));
    const results = new Map();
    while (pending.size) {
      let progress = false;
      for (const [id, task] of pending) {
        const dependencies = (task.dependsOn ?? []).map(dep => results.get(dep));
        if (dependencies.some(result => result && ['failed', 'skipped'].includes(result.status))) {
          results.set(id, { id, agentId: task.agentId, status: 'skipped', reason: 'A required dependency did not succeed.' });
          await emitProgress('agent.task.skipped', { taskId: id, agentId: task.agentId });
          pending.delete(id);
          progress = true;
        }
      }
      const ready = [...pending.values()].filter(task => (task.dependsOn ?? []).every(dep => results.get(dep)?.status === 'succeeded')).slice(0, this.maxParallel);
      if (!ready.length) {
        if (!progress) throw new Error('task dependency cycle or unresolved dependency detected');
        continue;
      }
      const batch = await Promise.all(ready.map(async task => {
        try {
          await emitProgress('agent.task.started', { taskId: task.id, agentId: task.agentId });
          const profile = await this.agentFactory.getExecutionProfile(task.agentId);
          const dependencyContext = (task.dependsOn ?? []).map(id => {
            const result = results.get(id);
            return `Dependency ${id}: ${result.summary ?? result.reason ?? result.status}`;
          }).join('\n');
          const execution = await this.agentService.runTask({
            request: task.request,
            model: task.model ?? this.defaultModel,
            workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
            plan: [task.plan, dependencyContext].filter(Boolean).join('\n\n') || null,
            allowedTools: profile.allowedTools,
            resourceLimits: profile.resourceLimits,
            onProgress: onProgress ? event => onProgress({ type: event.type, details: { ...event.details, taskId: task.id, agentId: task.agentId } }) : null,
          });
          if (execution?.completed !== true) {
            await emitProgress('agent.task.failed', { taskId: task.id, agentId: task.agentId, reason: 'completion_not_verified' });
            return { id: task.id, agentId: task.agentId, status: 'failed', summary: execution?.summary ?? execution?.message ?? 'Agent did not verify task completion.', execution };
          }
          await emitProgress('agent.task.completed', { taskId: task.id, agentId: task.agentId, evidenceCount: execution.evidence?.length ?? 0 });
          return { id: task.id, agentId: task.agentId, status: 'succeeded', summary: execution.summary ?? 'Completed with verified evidence.', evidence: execution.evidence ?? [], workspaceId: execution.workspaceId };
        } catch (error) {
          await emitProgress('agent.task.failed', { taskId: task.id, agentId: task.agentId, reason: 'execution_failed' });
          return { id: task.id, agentId: task.agentId, status: 'failed', reason: error.message };
        }
      }));
      for (const result of batch) {
        results.set(result.id, result);
        pending.delete(result.id);
      }
    }
    const ordered = tasks.map(task => results.get(task.id));
    const succeeded = ordered.filter(result => result.status === 'succeeded').length;
    const failed = ordered.filter(result => result.status === 'failed').length;
    const skipped = ordered.filter(result => result.status === 'skipped').length;
    return {
      status: failed === 0 && skipped === 0 ? 'completed' : succeeded > 0 ? 'partial' : 'failed',
      workspaceId,
      summary: { total: ordered.length, succeeded, failed, skipped },
      tasks: ordered,
    };
  }
}
