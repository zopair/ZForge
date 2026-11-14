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
    if (task.modelRole !== undefined && (typeof task.modelRole !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(task.modelRole))) throw new TypeError(`modelRole is invalid for task ${task.id}`);
    if (task.review !== undefined) {
      const review = task.review;
      if (!review || typeof review !== 'object' || Array.isArray(review) || typeof review.reviewerAgentId !== 'string' || !review.reviewerAgentId.trim() || typeof review.qaAgentId !== 'string' || !review.qaAgentId.trim()) throw new TypeError(`review requires reviewerAgentId and qaAgentId for task ${task.id}`);
      if (review.maxIterations !== undefined && (!Number.isInteger(review.maxIterations) || review.maxIterations < 0 || review.maxIterations > 3)) throw new RangeError(`review.maxIterations must be between 0 and 3 for task ${task.id}`);
    }
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
  constructor({ agentFactory, agentService, modelRouter = null, maxParallel = 3, defaultModel = 'qwen3:8b' } = {}) {
    if (!agentFactory || typeof agentFactory.getExecutionProfile !== 'function') throw new TypeError('agentFactory.getExecutionProfile is required');
    if (!agentService || typeof agentService.runTask !== 'function') throw new TypeError('agentService.runTask is required');
    if (modelRouter !== null && typeof modelRouter.resolve !== 'function') throw new TypeError('modelRouter.resolve is required');
    if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 16) throw new RangeError('maxParallel must be between 1 and 16');
    this.agentFactory = agentFactory;
    this.agentService = agentService;
    this.modelRouter = modelRouter;
    this.modelRouterInitialization = null;
    this.maxParallel = maxParallel;
    if (typeof defaultModel !== 'string' || !defaultModel.trim()) throw new TypeError('defaultModel is required');
    this.defaultModel = defaultModel;
  }

  async #executeReviewedTask({ task, authorProfile, authorRoute, workspaceId, initialPlan, onProgress, emitProgress }) {
    if (!this.modelRouter || typeof this.modelRouter.resolveIndependentReview !== 'function') {
      throw new Error('independent review requires a model router with a distinct installed reviewer model');
    }
    const reviewerProfile = await this.agentFactory.getExecutionProfile(task.review.reviewerAgentId);
    const reviewerTools = new Set(reviewerProfile.allowedTools ?? []);
    if (!reviewerTools.has('read_file') || [...reviewerTools].some(name => !['read_file', 'list_files', 'finish_task'].includes(name))) {
      throw new Error('reviewer profile must be read-only and grant read_file/list_files only');
    }
    const qaProfile = await this.agentFactory.getExecutionProfile(task.review.qaAgentId);
    const qaTools = new Set(qaProfile.allowedTools ?? []);
    if (!qaTools.has('run_command') || !qaTools.has('read_file') || [...qaTools].some(name => !['read_file', 'list_files', 'run_command', 'finish_task'].includes(name))) {
      throw new Error('QA profile must grant read_file and run_command without workspace write or publish tools');
    }
    const reviewerRoute = this.modelRouter.resolveIndependentReview({ authorModel: authorRoute.model });
    if (!reviewerRoute?.model || reviewerRoute.model === authorRoute.model || reviewerRoute.independent !== true) {
      throw new Error('reviewer model must be distinct from the implementation model');
    }
    const qaRoute = this.modelRouter.resolve({ role: 'qa' });
    if (!qaRoute?.model) throw new Error('a configured local QA model is required');

    const runAuthor = async repairPlan => {
      await emitProgress('agent.implementation.started', { taskId: task.id, agentId: task.agentId, model: authorRoute.model });
      return this.agentService.runTask({
        request: task.request,
        model: authorRoute.model,
        workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
        plan: repairPlan,
        allowedTools: authorProfile.allowedTools,
        resourceLimits: authorProfile.resourceLimits,
        onProgress: onProgress ? event => onProgress({ type: event.type, details: { ...event.details, taskId: task.id, agentId: task.agentId } }) : null,
      });
    };

    let implementation = await runAuthor(initialPlan);
    if (implementation?.completed !== true) {
      return { status: 'failed', reason: implementation?.summary ?? implementation?.message ?? 'implementation_not_verified', implementation };
    }

    const maxIterations = task.review.maxIterations ?? 1;
    let review = null;
    let qa = null;
    for (let iteration = 1; iteration <= maxIterations + 1; iteration += 1) {
      await emitProgress('agent.review.started', { taskId: task.id, reviewerAgentId: task.review.reviewerAgentId, model: reviewerRoute.model, iteration });
      review = await this.agentService.runTask({
        request: `Independently review the implementation in the assigned workspace. Do not modify files and do not run commands. Inspect the changed source and relevant tests. Find concrete correctness defects, missing edge cases, unsafe assumptions, fake dependencies or configuration, and test gaps. Approve only when no material defect remains. For changes_requested, provide actionable findings with file/line references where possible.`,
        model: reviewerRoute.model,
        workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
        plan: `Implementation summary: ${implementation.summary ?? 'No summary supplied'}\nReview contract: inspect the actual workspace using read-only tools. Return assessment.decision and evidence-based assessment.findings.\nOriginal task: ${task.request}`,
        allowedTools: reviewerProfile.allowedTools,
        resourceLimits: reviewerProfile.resourceLimits,
        assessmentContract: { kind: 'review' },
        onProgress: onProgress ? event => onProgress({ type: event.type, details: { ...event.details, taskId: task.id, agentId: task.review.reviewerAgentId, stage: 'review' } }) : null,
      });
      if (review?.completed !== true || !review.assessment) {
        return { status: 'failed', reason: 'independent_review_not_verified', implementation, review, reviewIterations: iteration };
      }
      await emitProgress(review.assessment.decision === 'approved' ? 'agent.review.approved' : 'agent.review.changes_requested', {
        taskId: task.id, reviewerAgentId: task.review.reviewerAgentId, iteration, findings: review.assessment.findings,
      });
      if (review.assessment.decision === 'changes_requested') {
        if (iteration > maxIterations) return { status: 'failed', reason: 'review_changes_not_resolved', implementation, review, reviewIterations: iteration };
        implementation = await runAuthor([
          initialPlan,
          'Independent reviewer findings requiring repair:',
          ...review.assessment.findings.map((finding, index) => `${index + 1}. ${finding}`),
          'Fix the findings in the existing workspace, preserve unrelated work, and run relevant checks before finishing.',
        ].filter(Boolean).join('\n\n'));
        if (implementation?.completed !== true) return { status: 'failed', reason: 'review_repair_not_verified', implementation, review, reviewIterations: iteration };
        continue;
      }

      await emitProgress('agent.qa.started', { taskId: task.id, qaAgentId: task.review.qaAgentId, model: qaRoute.model, iteration });
      qa = await this.agentService.runTask({
        request: `Perform independent quality assurance for the implementation. Inspect the project manifests and test configuration, identify the real project test commands, run the relevant automated test suite and any directly relevant checks, inspect exit codes and outputs, and do not edit source files. Approve only if the executed checks pass; otherwise return changes_requested with exact failing commands and evidence.`,
        model: qaRoute.model,
        workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
        plan: `Original task: ${task.request}\nImplementation summary: ${implementation.summary ?? 'No summary supplied'}\nReviewer decision: approved\nRun real project tests in the assigned workspace. Do not invent test commands or report tests as passing without successful run_command evidence.`,
        allowedTools: qaProfile.allowedTools,
        resourceLimits: qaProfile.resourceLimits,
        assessmentContract: { kind: 'qa' },
        onProgress: onProgress ? event => onProgress({ type: event.type, details: { ...event.details, taskId: task.id, agentId: task.review.qaAgentId, stage: 'qa' } }) : null,
      });
      if (qa?.completed === true && qa.assessment?.decision === 'approved') {
        await emitProgress('agent.qa.completed', { taskId: task.id, qaAgentId: task.review.qaAgentId, iteration, evidenceCount: qa.evidence?.length ?? 0 });
        return {
          status: 'succeeded',
          implementation,
          review,
          qa,
          reviewIterations: iteration,
          summary: implementation.summary ?? 'Implementation independently reviewed and tested.',
          evidence: [...(implementation.evidence ?? []), ...(review.evidence ?? []), ...(qa.evidence ?? [])],
        };
      }
      await emitProgress('agent.qa.failed', { taskId: task.id, qaAgentId: task.review.qaAgentId, iteration, findings: qa?.assessment?.findings ?? [] });
      if (iteration > maxIterations) return { status: 'failed', reason: 'qa_gate_not_passed', implementation, review, qa, reviewIterations: iteration };
      implementation = await runAuthor([
        initialPlan,
        'QA findings requiring repair:',
        ...(qa?.assessment?.findings ?? ['QA did not produce a passing evidence-backed assessment.']).map((finding, index) => `${index + 1}. ${finding}`),
        'Fix the reported issues in the existing workspace, then finish with verifiable evidence.',
      ].filter(Boolean).join('\n\n'));
      if (implementation?.completed !== true) return { status: 'failed', reason: 'qa_repair_not_verified', implementation, review, qa, reviewIterations: iteration };
    }
    return { status: 'failed', reason: 'review_iteration_limit_reached', implementation, review, qa, reviewIterations: maxIterations + 1 };
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
          if (this.modelRouter && !this.modelRouter.initialized) {
            this.modelRouterInitialization ??= this.modelRouter.initialize();
            await this.modelRouterInitialization;
          }
          const route = this.modelRouter
            ? this.modelRouter.resolve({ role: task.modelRole ?? 'general', preferredModel: task.model ?? null })
            : { model: task.model ?? this.defaultModel, fallback: false, reason: null, role: task.modelRole ?? 'general' };
          await emitProgress('agent.model.selected', { taskId: task.id, agentId: task.agentId, role: route.role, model: route.model, fallback: route.fallback, reason: route.reason });
          const execution = task.review
            ? await this.#executeReviewedTask({
                task,
                authorProfile: profile,
                authorRoute: route,
                workspaceId,
                initialPlan: [task.plan, dependencyContext].filter(Boolean).join('\n\n') || null,
                onProgress,
                emitProgress,
              })
            : await this.agentService.runTask({
                request: task.request,
                model: route.model,
                workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
                plan: [task.plan, dependencyContext].filter(Boolean).join('\n\n') || null,
                allowedTools: profile.allowedTools,
                resourceLimits: profile.resourceLimits,
                onProgress: onProgress ? event => onProgress({ type: event.type, details: { ...event.details, taskId: task.id, agentId: task.agentId } }) : null,
              });
          const verified = task.review ? execution?.status === 'succeeded' : execution?.completed === true;
          if (!verified) {
            await emitProgress('agent.task.failed', { taskId: task.id, agentId: task.agentId, reason: execution?.reason ?? 'completion_not_verified' });
            return { id: task.id, agentId: task.agentId, model: route.model, status: 'failed', summary: execution?.reason ?? execution?.summary ?? execution?.message ?? 'Agent did not verify task completion.', execution };
          }
          const summary = task.review ? execution.summary : execution.summary ?? 'Completed with verified evidence.';
          const evidence = task.review ? execution.evidence : execution.evidence ?? [];
          await emitProgress('agent.task.completed', { taskId: task.id, agentId: task.agentId, model: route.model, evidenceCount: evidence?.length ?? 0, reviewed: Boolean(task.review) });
          return {
            id: task.id, agentId: task.agentId, model: route.model, status: 'succeeded',
            summary, evidence: evidence ?? [], workspaceId: task.workspaceId ?? `${workspaceId}-${task.id}`,
            ...(task.review ? { review: execution.review.assessment, qa: execution.qa.assessment, reviewIterations: execution.reviewIterations } : {}),
          };
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
