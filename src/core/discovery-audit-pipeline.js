import { classifyLicense, evaluateDiscoveryQuality } from './discovery-engine.js';

/** Inspect every candidate until the shared request ledger is exhausted. */
export async function auditDiscoveredCandidates({ candidates = [], inspector, budget, logger = console } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  if (!inspector || typeof inspector.inspectRepository !== 'function') throw new TypeError('repository inspector is required');
  const accepted = [];
  const rejected = [];
  const quarantined = [];
  let processed = 0;
  let budgetExhausted = false;
  const log = message => (logger.info ?? logger.log ?? (() => {})).call(logger, message);
  const remaining = () => budget?.snapshot?.().remainingBudget ?? Infinity;

  for (const candidate of candidates) {
    const fullName = candidate.fullName ?? candidate.full_name;
    if (!fullName) {
      rejected.push({ fullName: 'unknown', reason: 'Rejected: Missing repository identity' });
      log('[QUALITY] unknown — Rejected: Missing repository identity');
      processed += 1;
      continue;
    }
    if (remaining() <= 0) {
      budgetExhausted = true;
      const reason = 'Skipped: API budget exhausted before inspection';
      log(`[QUALITY] ${fullName} — ${reason}`);
      break;
    }
    try {
      const inspection = await inspector.inspectRepository(fullName);
      processed += 1;
      const repository = {
        ...candidate,
        ...(inspection.repository ?? {}),
        fork: candidate.fork === true,
        forkAheadBy: candidate.forkAheadBy ?? 0,
        uniqueCommits: candidate.uniqueCommits ?? 0,
        forkComparisonVerified: candidate.forkComparisonVerified === true,
        structuralEvidence: inspection.structuralEvidence,
      };
      const quality = evaluateDiscoveryQuality(repository);
      const cost = inspection.zeroCostAssessment;
      const license = classifyLicense(repository.license);
      const reasons = [];
      if (inspection.inspectionComplete === false) reasons.push('Inspection incomplete: API budget exhausted before all priority files were read');
      if (!quality.eligible) {
        reasons.push(
          ...quality.failures.map(code => ({
            README_MISSING: 'Rejected: Missing README',
            STRUCTURAL_EVIDENCE_MISSING: 'Rejected: Missing structural evidence',
            FORK_NOT_SIGNIFICANTLY_AHEAD: 'Rejected: Unqualified Fork',
            INACTIVE_OVER_12_MONTHS: 'Rejected: No commit activity within 12 months',
          }[code] ?? `Rejected: ${code}`)),
          ...quality.unresolved.map(code => `Quarantined: ${code}`),
        );
      }
      if (cost?.status === 'REJECTED_PAID_REQUIREMENT') reasons.push('Rejected: Commercial SaaS keys or paid dependencies detected');
      else if (cost?.status !== 'STATIC_REVIEW_CLEAR') reasons.push('Quarantined: Zero-cost dependencies not fully verified');
      if (license.status !== 'OPEN_SOURCE') reasons.push(`Quarantined: License not verified as approved open source (${license.spdxId ?? 'unknown'})`);
      const evidence = inspection.evidence;
      if (!evidence?.sourcePath || !evidence?.snippet) reasons.push('Quarantined: Missing source-file evidence');
      const isAccepted = reasons.length === 0;
      const record = {
        name: repository.name ?? fullName.split('/')[1],
        repoUrl: repository.htmlUrl ?? `https://github.com/${fullName}`,
        capability: (candidate.capabilities ?? ['OCR']).join(', '),
        license: license.spdxId,
        costAssessment: cost?.status ?? 'UNVERIFIED',
        status: isAccepted ? 'HUMAN_REVIEW_REQUIRED' : reasons[0],
        evidence,
        architecture: { architecture: 'unknown', runtime: 'local' },
        inspection,
      };
      if (isAccepted) {
        accepted.push(record);
        log(`[QUALITY] ${fullName} — ACCEPTED: quality, structure, license, cost and evidence gates clear; human review still required`);
      } else {
        const message = reasons.join('; ');
        const target = reasons.some(reason => reason.startsWith('Rejected:')) ? rejected : quarantined;
        target.push({ fullName, reason: message, inspectionComplete: inspection.inspectionComplete !== false });
        log(`[QUALITY] ${fullName} — ${message}`);
      }
      if (remaining() <= 0) budgetExhausted = true;
    } catch (error) {
      processed += 1;
      if (remaining() <= 0 || error?.safeHalt || error?.name === 'ApiBudgetExceededError') {
        budgetExhausted = true;
        const reason = 'Quarantined: Inspection stopped at the global API budget boundary';
        quarantined.push({ fullName, reason, incomplete: true });
        log(`[QUALITY] ${fullName} — ${reason}`);
        break;
      }
      const reason = `Rejected: Inspection failed (${error instanceof Error ? error.message : String(error)})`;
      rejected.push({ fullName, reason });
      log(`[QUALITY] ${fullName} — ${reason}`);
    }
    if (budgetExhausted) break;
  }
  let skipped = 0;
  if (budgetExhausted) {
    for (const candidate of candidates.slice(processed)) {
      const fullName = candidate.fullName ?? candidate.full_name ?? 'unknown';
      const reason = 'Skipped: API budget exhausted; not inspected';
      skipped += 1;
      log(`[QUALITY] ${fullName} — ${reason}`);
    }
  }
  return { accepted, rejected, quarantined, processed, skipped, budgetExhausted };
}
