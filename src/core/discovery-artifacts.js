import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { renderCatalogEntry, renderDailyBrief } from './discovery-output.js';

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

/** Persist source-backed catalog entries and a live-run brief, then hash the exact brief bytes. */
export async function writeDiscoveryArtifacts({
  accepted = [], audit = {}, apiRequests = 0, apiRequestBudget = 50,
  catalogPath = 'research_logs/tools_catalog.md', briefPath = 'DAILY_BRIEF.md',
  logger = console, generatedAt = new Date().toISOString(),
} = {}) {
  await mkdir(dirname(catalogPath), { recursive: true });
  await mkdir(dirname(briefPath), { recursive: true });
  const existingCatalog = await readOptional(catalogPath);
  const catalog = existingCatalog.trim() || '# ZForge Research Tools Catalog\n';
  const entries = accepted.map(candidate => renderCatalogEntry({
    ...candidate, date: generatedAt.slice(0, 10), evidence: candidate.evidence,
  }));
  const catalogOutput = entries.length
    ? `${catalog.trimEnd()}\n\n${entries.join('\n')}\n`
    : `${catalog.trimEnd()}\n\n_No newly verified candidates in this bounded run._\n`;
  await writeFile(catalogPath, catalogOutput, 'utf8');
  logger.info?.(`[OUTPUT] Wrote ${catalogPath}; newly accepted entries=${entries.length}; bytes=${Buffer.byteLength(catalogOutput)}.`);

  const brief = renderDailyBrief({
    generatedAt, discoveries: accepted, apiRequests, apiRequestBudget, dryRun: false,
    audit: {
      processed: audit.processed ?? 0, accepted: accepted.length,
      rejected: audit.rejected?.length ?? 0, quarantined: audit.quarantined?.length ?? 0,
      skipped: audit.skipped ?? 0,
    },
  });
  const briefBytes = `${brief}\n`;
  await writeFile(briefPath, briefBytes, 'utf8');
  const sha256 = createHash('sha256').update(briefBytes, 'utf8').digest('hex');
  logger.info?.(`[OUTPUT] Wrote ${briefPath}; bytes=${Buffer.byteLength(briefBytes)}.`);
  logger.info?.(`[SHA256] ${briefPath} ${sha256}`);
  return { catalogPath, briefPath, catalogEntries: entries.length, catalogBytes: Buffer.byteLength(catalogOutput), briefBytes: Buffer.byteLength(briefBytes), sha256 };
}
