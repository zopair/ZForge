const WORKSPACE_STATES = new Set(['ready', 'active', 'paused', 'archived']);
const EXPERIMENT_STATES = new Set(['running', 'succeeded', 'failed', 'inconclusive', 'promoted']);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
}

/**
 * Workspace control-plane registry.
 *
 * This module records workspace intent and experiment history. A concrete
 * runtime adapter is responsible for provisioning terminals, filesystems,
 * browsers, package managers and processes on the host selected by deployment.
 */
export class AgentWorkspaceManager {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.clock = clock;
    this.workspaces = new Map();
  }

  createWorkspace({
    id,
    name,
    agentId,
    purpose = '',
    profile = 'general',
    capabilities = [],
    environment = {},
    resources = {},
    collaboration = {},
  } = {}) {
    const workspaceId = requireText(id, 'workspace id');
    if (this.workspaces.has(workspaceId)) throw new Error(`workspace already exists: ${workspaceId}`);
    const workspace = {
      id: workspaceId,
      name: requireText(name, 'workspace name'),
      agentId: requireText(agentId, 'agent id'),
      purpose: String(purpose),
      profile: requireText(profile, 'workspace profile'),
      status: 'ready',
      mode: 'experimental',
      capabilities: [...new Set(['filesystem', 'terminal', 'package-install', 'network-research', 'git', 'browser', 'test-runner', 'artifact-store', ...capabilities.map(String)])],
      environment: clone(environment),
      resources: {
        strategy: 'adaptive',
        requested: {},
        ...clone(resources),
      },
      collaboration: {
        enabled: true,
        sharedArtifacts: true,
        ...clone(collaboration),
      },
      experiments: [],
      observations: [],
      createdAt: this.clock(),
      updatedAt: this.clock(),
    };
    this.workspaces.set(workspaceId, workspace);
    return clone(workspace);
  }

  getWorkspace(id) {
    const workspace = this.workspaces.get(requireText(id, 'workspace id'));
    return workspace ? clone(workspace) : null;
  }

  listWorkspaces({ agentId, status } = {}) {
    return [...this.workspaces.values()]
      .filter(item => !agentId || item.agentId === agentId)
      .filter(item => !status || item.status === status)
      .map(clone);
  }

  setWorkspaceStatus(id, status) {
    if (!WORKSPACE_STATES.has(status)) throw new TypeError(`unsupported workspace status: ${status}`);
    const workspace = this.#requireWorkspace(id);
    workspace.status = status;
    workspace.updatedAt = this.clock();
    return clone(workspace);
  }

  addObservation(id, observation) {
    const workspace = this.#requireWorkspace(id);
    const entry = {
      id: requireText(observation?.id, 'observation id'),
      kind: observation.kind ?? 'discovery',
      note: requireText(observation.note, 'observation note'),
      evidence: clone(observation.evidence ?? []),
      createdAt: this.clock(),
    };
    workspace.observations.push(entry);
    workspace.updatedAt = this.clock();
    return clone(entry);
  }

  startExperiment(workspaceId, {
    id,
    title,
    hypothesis,
    approach = '',
    tools = [],
    variants = [],
  } = {}) {
    const workspace = this.#requireWorkspace(workspaceId);
    const experimentId = requireText(id, 'experiment id');
    if (workspace.experiments.some(item => item.id === experimentId)) throw new Error(`experiment already exists: ${experimentId}`);
    const experiment = {
      id: experimentId,
      title: requireText(title, 'experiment title'),
      hypothesis: requireText(hypothesis, 'experiment hypothesis'),
      approach: String(approach),
      tools: [...tools],
      variants: clone(variants),
      status: 'running',
      outcome: null,
      artifacts: [],
      findings: [],
      startedAt: this.clock(),
      finishedAt: null,
      promotedAt: null,
      promotionTarget: null,
    };
    workspace.experiments.push(experiment);
    workspace.status = 'active';
    workspace.updatedAt = this.clock();
    return clone(experiment);
  }

  finishExperiment(workspaceId, experimentId, {
    outcome,
    findings = [],
    artifacts = [],
    metrics = {},
  } = {}) {
    if (!['succeeded', 'failed', 'inconclusive'].includes(outcome)) throw new TypeError('outcome must be succeeded, failed, or inconclusive');
    const workspace = this.#requireWorkspace(workspaceId);
    const experiment = this.#requireExperiment(workspace, experimentId);
    if (experiment.status !== 'running') throw new Error('only running experiments can be finished');
    experiment.status = outcome;
    experiment.outcome = { summary: String(findings[0] ?? outcome), metrics: clone(metrics) };
    experiment.findings = clone(findings);
    experiment.artifacts = clone(artifacts);
    experiment.finishedAt = this.clock();
    workspace.updatedAt = this.clock();
    return clone(experiment);
  }

  promoteExperiment(workspaceId, experimentId, { target = 'shared-tool-catalog' } = {}) {
    const workspace = this.#requireWorkspace(workspaceId);
    const experiment = this.#requireExperiment(workspace, experimentId);
    if (experiment.status !== 'succeeded') throw new Error('only successful experiments can be promoted');
    experiment.status = 'promoted';
    experiment.promotionTarget = requireText(target, 'promotion target');
    experiment.promotedAt = this.clock();
    workspace.updatedAt = this.clock();
    return clone(experiment);
  }

  #requireWorkspace(id) {
    const workspace = this.workspaces.get(requireText(id, 'workspace id'));
    if (!workspace) throw new Error(`workspace not found: ${id}`);
    return workspace;
  }

  #requireExperiment(workspace, id) {
    const experiment = workspace.experiments.find(item => item.id === id);
    if (!experiment) throw new Error(`experiment not found: ${id}`);
    return experiment;
  }
}

export { WORKSPACE_STATES, EXPERIMENT_STATES };
