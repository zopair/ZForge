export class TaskRunner {
  constructor({ taskStore, agentService, chiefAgent = null, agentFactory = null } = {}) {
    if (!taskStore || typeof taskStore.get !== 'function' || typeof taskStore.transition !== 'function' || typeof taskStore.appendEvent !== 'function') throw new TypeError('taskStore must support get, transition and appendEvent');
    if (!agentService || typeof agentService.runTask !== 'function') throw new TypeError('agentService.runTask is required');
    this.taskStore = taskStore;
    this.agentService = agentService;
    this.chiefAgent = chiefAgent;
    this.agentFactory = agentFactory;
  }

  async runTask({ taskId, task: queuedTask = null, options = {}, signal } = {}) {
    const task = queuedTask ?? this.taskStore.get(taskId);
    if (!task || task.id !== taskId) throw new Error('task not found');
    if (task.status !== 'queued') throw new Error(`task cannot start from status ${task.status}`);
    const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : 'qwen3:8b';
    const agentId = options.agentId ?? null;
    await this.taskStore.transition(taskId, 'running', { details: { model, agentId, scheduler: true } });
    const emit = async (type, details = {}) => this.taskStore.appendEvent(taskId, type, details);
    try {
      await emit('task.planning.started', { agentId });
      const capabilities = Array.isArray(options.capabilities) ? options.capabilities.slice(0, 20).map(String) : [];
      const keywords = Array.isArray(options.keywords)
        ? options.keywords.slice(0, 12).map(String)
        : [...new Set(task.request.match(/[\p{L}\p{N}._+-]{3,}/gu) ?? [])].slice(0, 12);
      const planning = this.chiefAgent
        ? await this.chiefAgent.planTask({ request: task.request, capabilities, keywords, signal })
        : null;
      await emit('task.planning.completed', { status: planning?.status ?? 'SKIPPED', discoveryStatus: planning?.discoveryStatus ?? null });
      if (signal?.aborted) {
        return this.taskStore.transition(taskId, 'cancelled', { error: String(signal.reason ?? 'cancelled'), details: { phase: 'planning' } });
      }

      const profile = agentId ? await this.agentFactory?.getExecutionProfile(agentId) : null;
      if (agentId && !profile) throw new Error('active agent profile is unavailable');
      const execution = await this.agentService.runTask({
        request: task.request,
        model,
        workspaceId: task.workspaceId,
        plan: planning?.plan ?? (typeof options.approvedPlan === 'string' ? options.approvedPlan : null),
        allowedTools: profile?.allowedTools ?? null,
        resourceLimits: profile?.resourceLimits ?? null,
        signal,
        onEvent: async event => emit(event.type, event.details ?? {}),
      });
      if (signal?.aborted || execution.status === 'cancelled') {
        return this.taskStore.transition(taskId, 'cancelled', { result: execution, error: String(signal?.reason ?? 'cancelled'), details: { phase: 'execution' } });
      }
      const result = {
        ...execution,
        agentProfile: profile ? { agentId: profile.agentId, name: profile.name, version: profile.version } : null,
        planning: planning ? {
          status: planning.status,
          discoveryStatus: planning.discoveryStatus,
          candidatesConsidered: planning.candidatesConsidered,
          proposedInternalBuilds: planning.proposedInternalBuilds,
        } : null,
      };
      const status = result.completed === true ? 'succeeded' : 'inconclusive';
      return this.taskStore.transition(taskId, status, {
        result,
        error: result.completed === true ? null : 'agent did not provide verified completion evidence',
        details: { steps: result.steps ?? 0, agentStatus: result.status ?? 'unknown' },
      });
    } catch (error) {
      const current = this.taskStore.get(taskId);
      if (current?.status !== 'running') throw error;
      const status = signal?.aborted || error.name === 'AbortError' ? 'cancelled' : 'failed';
      return this.taskStore.transition(taskId, status, {
        error: error.message,
        details: { phase: 'agent-run', agentId },
      });
    }
  }
}
