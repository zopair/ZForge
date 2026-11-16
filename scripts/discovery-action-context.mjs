import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function getDiscoveryActionContext() {
  const context = github.context;
  const token = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  const configuredBudget = core.getInput('api-budget', { required: false }) || process.env.DISCOVERY_API_BUDGET || '50';
  const apiBudget = Number(configuredBudget);
  if (!Number.isInteger(apiBudget) || apiBudget < 1 || apiBudget > 50) throw new RangeError('api-budget must be an integer between 1 and 50');
  return { repository: context.repo, sha: context.sha, ref: context.ref, runId: context.runId, actor: context.actor, token, apiBudget };
}

/** Durable cursor file for future workflow runs; GITHUB_STATE is action-lifecycle state only. */
export async function readDiscoveryCursor(path = 'discovery_cursor.json') {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('cursor must be a JSON object');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, cursor: null, updatedAt: null };
    throw error;
  }
}

export async function writeDiscoveryCursor(cursor, path = 'discovery_cursor.json') {
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) throw new TypeError('cursor must be a JSON object');
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, ...cursor, updatedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  if (process.env.GITHUB_STATE) core.saveState('discovery_cursor', JSON.stringify(cursor));
  core.setOutput('discovery_cursor_path', path);
  return path;
}

export function getActionLifecycleCursor() {
  const state = core.getState('discovery_cursor');
  if (!state) return null;
  try { return JSON.parse(state); } catch { return null; }
}
