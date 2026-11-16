import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { GlobalApiBudget } from '../core/global-api-budget.js';

const ThrottledOctokit = Octokit.plugin(throttling);

/**
 * Sole outbound GitHub REST boundary for discovery and inspection.
 * Preflight and all data reads share one budget. Retries are disabled so no
 * hidden retry can bypass the strict per-run request ceiling.
 */
export class GitHubApiClient {
  #octokit;
  #rateLimits = null;
  #preflightPromise = null;

  constructor({ token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null, budget = new GlobalApiBudget(), baseUrl } = {}) {
    this.budget = budget;
    const options = {
      auth: token || undefined,
      throttle: {
        onRateLimit: (retryAfter, request, octokit) => {
          budget.halt(`GitHub primary rate limit reached; safe halt (retryAfter=${retryAfter}s, ${request.method} ${request.url}).`);
          octokit.log.warn(budget.haltReason);
          return false;
        },
        onSecondaryRateLimit: (retryAfter, request, octokit) => {
          budget.halt(`GitHub secondary rate limit detected; safe halt (retryAfter=${retryAfter}s, ${request.method} ${request.url}).`);
          octokit.log.warn(budget.haltReason);
          return false;
        },
      },
      retry: { enabled: false },
    };
    if (baseUrl) options.baseUrl = baseUrl;
    this.#octokit = new ThrottledOctokit(options);
  }

  async #preflight(resource) {
    if (!this.#preflightPromise) {
      this.#preflightPromise = (async () => {
        this.budget.consume({ method: 'GET', url: '/rate_limit' });
        try {
          const { data } = await this.#octokit.rest.rateLimit.get();
          this.#rateLimits = data.resources ?? {};
        } catch (error) {
          this.budget.halt(`GitHub rate-limit preflight failed; discovery halted safely: ${error.message}`);
          throw error;
        }
      })();
    }
    await this.#preflightPromise;
    const bucket = this.#rateLimits?.[resource] ?? this.#rateLimits?.core;
    if (!bucket) {
      this.budget.halt(`GitHub ${resource} quota metadata is unavailable; discovery halted safely.`);
      throw new Error(this.budget.haltReason);
    }
    this.budget.observeQuota(bucket, resource);
    if (this.budget.halted) throw new Error(this.budget.haltReason);
  }

  async request(route, parameters = {}, { resource = 'core' } = {}) {
    if (typeof route !== 'string' || !/^GET\s+/.test(route)) throw new TypeError('Discovery API client permits GET requests only.');
    await this.#preflight(resource);
    this.budget.consume({ method: 'GET', url: route });
    try {
      const response = await this.#octokit.request(route, parameters);
      this.budget.observeHeaders(response.headers);
      return response;
    } catch (error) {
      if (error.status === 403 || error.status === 429) this.budget.halt(`GitHub returned HTTP ${error.status}; wait for the official reset window.`);
      throw error;
    }
  }

  snapshot() {
    return this.budget.snapshot();
  }
}
