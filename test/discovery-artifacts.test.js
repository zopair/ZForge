import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeDiscoveryArtifacts } from '../src/core/discovery-artifacts.js';

test('artifact writer physically writes catalog and daily brief and hashes exact brief bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zforge-artifacts-'));
  const catalogPath = path.join(directory, 'research_logs', 'tools_catalog.md');
  const briefPath = path.join(directory, 'DAILY_BRIEF.md');
  const logs = [];
  try {
    const result = await writeDiscoveryArtifacts({
      accepted: [{
        name: 'OCR Tool', repoUrl: 'https://github.com/example/ocr',
        capability: 'OCR', license: 'MIT', costAssessment: 'STATIC_REVIEW_CLEAR',
        status: 'HUMAN_REVIEW_REQUIRED',
        evidence: { sourcePath: 'README.md', snippet: '# OCR tool', url: 'https://github.com/example/ocr/blob/main/README.md' },
        architecture: { architecture: 'serverless', runtime: 'local' },
      }],
      audit: { processed: 1, rejected: [], quarantined: [], skipped: 0 },
      apiRequests: 5, apiRequestBudget: 5, catalogPath, briefPath,
      logger: { info: line => logs.push(line) },
      generatedAt: '2026-11-16T00:00:00.000Z',
    });
    const catalog = await readFile(catalogPath, 'utf8');
    const brief = await readFile(briefPath, 'utf8');
    assert.match(catalog, /Exact repository: https:\/\/github.com\/example\/ocr/);
    assert.match(brief, /LIVE BOUNDED GITHUB RESEARCH/);
    assert.match(brief, /API requests: 5\/5/);
    assert.equal(result.sha256, createHash('sha256').update(brief, 'utf8').digest('hex'));
    assert.ok(logs.some(line => line.includes('[SHA256]') && line.includes(briefPath)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
