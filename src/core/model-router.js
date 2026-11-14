/**
 * Local, provider-neutral model routing for ZForge HIVE.
 * Model names are accepted only when the local runtime reports them as installed.
 */
export class LocalModelRouter {
  constructor({ modelAdapter, defaultModel, routes = {} } = {}) {
    if (!modelAdapter || typeof modelAdapter.listModels !== 'function') {
      throw new TypeError('modelAdapter.listModels is required');
    }
    if (typeof defaultModel !== 'string' || !defaultModel.trim()) {
      throw new TypeError('defaultModel is required');
    }
    if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
      throw new TypeError('routes must be an object keyed by specialist role');
    }
    for (const [role, model] of Object.entries(routes)) {
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(role) || typeof model !== 'string' || !model.trim()) {
        throw new TypeError('each model route requires a valid role and model name');
      }
    }
    this.modelAdapter = modelAdapter;
    this.defaultModel = defaultModel.trim();
    this.routes = { ...routes };
    this.installedModels = new Set();
    this.initialized = false;
  }

  async initialize() {
    const models = await this.modelAdapter.listModels();
    if (!Array.isArray(models)) throw new TypeError('local model runtime returned an invalid model list');
    this.installedModels = new Set(models.filter(model => typeof model === 'string' && model.trim()).map(model => model.trim()));
    if (!this.installedModels.has(this.defaultModel)) {
      throw new Error(`default model "${this.defaultModel}" is not installed locally`);
    }
    this.initialized = true;
    return this;
  }

  resolve({ role = 'general', preferredModel = null } = {}) {
    if (!this.initialized) throw new Error('model router must be initialized before resolving models');
    if (typeof role !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(role)) {
      throw new TypeError('role must be a valid specialist role');
    }
    if (preferredModel !== null) {
      if (typeof preferredModel !== 'string' || !preferredModel.trim()) throw new TypeError('preferredModel must be a non-empty model name');
      const model = preferredModel.trim();
      if (!this.installedModels.has(model)) throw new Error(`requested model "${model}" is not installed locally`);
      return { model, requestedModel: model, role, fallback: false, reason: null };
    }

    const requestedModel = this.routes[role] ?? this.defaultModel;
    if (this.installedModels.has(requestedModel)) {
      return { model: requestedModel, requestedModel, role, fallback: false, reason: null };
    }
    return {
      model: this.defaultModel,
      requestedModel,
      role,
      fallback: true,
      reason: 'configured_model_not_installed',
    };
  }

  resolveIndependentReview({ authorModel, preferredModel = this.routes.review ?? null } = {}) {
    if (!this.initialized) throw new Error('model router must be initialized before resolving models');
    if (typeof authorModel !== 'string' || !authorModel.trim()) throw new TypeError('authorModel is required');
    const author = authorModel.trim();
    const candidates = [
      ...(typeof preferredModel === 'string' && preferredModel.trim() ? [preferredModel.trim()] : []),
      ...this.installedModels,
    ];
    const reviewer = candidates.find(model => this.installedModels.has(model) && model !== author);
    if (!reviewer) throw new Error('independent review requires a distinct installed model');
    return {
      model: reviewer,
      role: 'review',
      independent: true,
      authorModel: author,
      sameModel: false,
    };
  }

  getStatus() {
    return {
      initialized: this.initialized,
      defaultModel: this.defaultModel,
      installedModels: [...this.installedModels].sort(),
      routes: { ...this.routes },
    };
  }
}
