import { GlobalApiBudget } from '../core/global-api-budget.js';
import { GitHubApiClient } from './github-api-client.js';
import { GitHubDiscoveryClient } from './github-discovery.js';
import { GitHubRepositoryInspector } from './github-repository-inspector.js';

/** Construct both adapters over exactly one Octokit client and request ledger. */
export function createDiscoveryAdapters({ token = null, budget = new GlobalApiBudget(), apiClient = null } = {}) {
  const sharedApiClient = apiClient ?? new GitHubApiClient({ token, budget });
  const sharedBudget = sharedApiClient.budget ?? budget;
  return {
    apiClient: sharedApiClient,
    budget: sharedBudget,
    discovery: new GitHubDiscoveryClient({ apiClient: sharedApiClient }),
    inspector: new GitHubRepositoryInspector({ apiClient: sharedApiClient }),
  };
}
