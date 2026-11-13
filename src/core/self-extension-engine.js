const REPOSITORY_MODES = new Set([
  'FORK_AND_MODIFY',
  'MODIFIED_CLONE',
  'REIMPLEMENT_CLEAN_ROOM',
  'REVERSE_ENGINEER',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assessCapabilityGap({ capability, discovery } = {}) {
  if (typeof capability !== 'string' || !capability.trim()) {
    throw new TypeError('capability is required');
  }
  if (!isObject(discovery)) throw new TypeError('discovery evidence is required');

  const results = Array.isArray(discovery.results) ? discovery.results : [];
  const eligible = results.find((item) => {
    const evaluation = item?.evaluation ?? item?.gateEvaluation;
    return evaluation?.eligible === true && evaluation?.status === 'CANDIDATE' && (item.capabilities ?? []).includes(capability);
  });

  if (eligible) {
    return {
      action: 'REUSE_VERIFIED_TOOL',
      capability: capability.trim(),
      selectedTool: eligible.fullName ?? eligible.repository?.fullName ?? null,
      requiresApproval: false,
      reason: 'ELIGIBLE_TOOL_ALREADY_EXISTS',
    };
  }

  const complete = discovery.complete === true || discovery.status === 'COMPLETE';

  if (!complete || discovery.queryCatalogComplete === false) {
    return {
      action: 'CONTINUE_DISCOVERY',
      capability: capability.trim(),
      selectedTool: null,
      requiresApproval: false,
      reason: 'DISCOVERY_NOT_PROVEN_COMPLETE',
      unresolved: discovery.unresolved ?? [],
    };
  }

  if (results.length > 0 && discovery.candidateEvaluationComplete !== true) {
    return {
      action: 'EVALUATE_DISCOVERED_CANDIDATES',
      capability: capability.trim(),
      selectedTool: null,
      requiresApproval: false,
      reason: 'DISCOVERED_CANDIDATES_NOT_FULLY_EVALUATED',
      candidatesToReview: results.length,
    };
  }

  return {
    action: 'BUILD_INTERNAL_TOOL',
    capability: capability.trim(),
    selectedTool: null,
    requiresApproval: true,
    reason: 'NO_ELIGIBLE_TOOL_FOUND_AFTER_COMPLETE_DISCOVERY',
    quarantinedCandidates: results
      .filter((item) => (item?.evaluation ?? item?.gateEvaluation)?.status === 'QUARANTINED')
      .map((item) => item.fullName ?? item.repository?.fullName ?? null)
      .filter(Boolean),
    rejectedCandidates: results
      .filter((item) => (item?.evaluation ?? item?.gateEvaluation)?.status === 'REJECTED')
      .map((item) => item.fullName ?? item.repository?.fullName ?? null)
      .filter(Boolean),
  };
}

export function createToolBuildBrief({ capability, task, constraints = {}, evidence = [] } = {}) {
  if (typeof capability !== 'string' || !capability.trim()) {
    throw new TypeError('capability is required');
  }
  if (typeof task !== 'string' || !task.trim()) throw new TypeError('task is required');
  if (!isObject(constraints)) throw new TypeError('constraints must be an object');
  if (!Array.isArray(evidence)) throw new TypeError('evidence must be an array');

  return {
    status: 'PROPOSED',
    capability: capability.trim(),
    objective: task.trim(),
    zeroBudgetOnly: true,
    openSourceOnly: true,
    preferredImplementationOrder: [
      'reuse-existing-verified-components',
      'adapt-license-compatible-open-source-components',
      'build-minimal-original-implementation',
    ],
    constraints: {
      noPaidApis: true,
      noPaidSaas: true,
      noTrialCredits: true,
      selfHostedOrLocal: true,
      resourceCeilings: { ...constraints },
    },
    requiredWork: [
      'capability-and-interface-specification',
      'license-and-dependency-audit',
      'architecture-and-threat-model',
      'implementation-with-pinned-dependencies',
      'unit-integration-and-regression-tests',
      'resource-and-performance-benchmarks',
      'documentation-and-reproducible-build',
      'provenance-and-license-notice-preservation',
      'independent-security-and-quality-review',
    ],
    acceptanceTests: [
      'representative-workload',
      'edge-cases',
      'adversarial-inputs',
      'offline-or-local-operation',
      'missing-dependency',
      'quota-and-resource-exhaustion',
      'reproducible-build',
      'license-compliance',
    ],
    discoveryEvidence: evidence,
    executionPolicy: {
      isolatedWorkspace: true,
      untrustedScriptsRequireReview: true,
      defaultDenyNetwork: true,
      secretsUnavailableToModelsAndBuildScripts: true,
      noSelfApproval: true,
      branchAndPullRequestOnly: true,
      mergePublishOrSignRequiresHumanApproval: true,
    },
    requiresIndependentReview: true,
    requiresApprovalBeforeImplementation: true,
    rollback: 'Discard the isolated task workspace and retain the last verified tool version.',
  };
}

export function evaluateRepositoryReuse({
  mode,
  licenseVerified = null,
  licenseCompatible = null,
  noticesPreserved = false,
  sourceProvenanceRecorded = false,
  securityReviewed = false,
  lawfulPurpose = null,
  bypassesAccessControls = false,
  handlesSecretsOrPrivateData = false,
  cleanRoom = false,
} = {}) {
  if (!REPOSITORY_MODES.has(mode)) throw new TypeError('unsupported repository reuse mode');

  const blockers = [];
  const requiresComplianceReview = mode === 'FORK_AND_MODIFY' || mode === 'MODIFIED_CLONE';

  if (requiresComplianceReview) {
    if (licenseVerified !== true) blockers.push('LICENSE_NOT_VERIFIED');
    if (licenseCompatible !== true) blockers.push('LICENSE_INCOMPATIBLE');
    if (noticesPreserved !== true) blockers.push('LICENSE_NOTICES_NOT_PRESERVED');
    if (sourceProvenanceRecorded !== true) blockers.push('SOURCE_PROVENANCE_MISSING');
    if (securityReviewed !== true) blockers.push('SECURITY_REVIEW_MISSING');
  }

  if (mode === 'REIMPLEMENT_CLEAN_ROOM' && cleanRoom !== true) {
    blockers.push('CLEAN_ROOM_SEPARATION_NOT_ESTABLISHED');
  }

  if (mode === 'REVERSE_ENGINEER') {
    if (lawfulPurpose !== true) blockers.push('UNLAWFUL_OR_UNAUTHORIZED_PURPOSE');
    if (bypassesAccessControls === true) blockers.push('ACCESS_CONTROL_BYPASS');
    if (handlesSecretsOrPrivateData === true) blockers.push('PRIVATE_DATA_OR_SECRET_EXPOSURE');
  }

  return {
    allowed: blockers.length === 0,
    mode,
    blockers,
    requiresComplianceReview,
    restrictions: [
      'Do not copy proprietary source code, protected assets or confidential implementation details.',
      'Do not bypass authentication, DRM, technical protection measures, rate limits or contractual access controls.',
      'Use public interfaces, documented protocols, authorized test environments and synthetic data.',
      'For clean-room reimplementation, keep behavioral observations separate from independently authored implementation.',
      'Preserve applicable copyright notices, attribution, source offers and reciprocal-license obligations.',
      'Do not import secrets, private user data or credentials into analysis, prompts, tests or generated artifacts.',
    ],
  };
}
