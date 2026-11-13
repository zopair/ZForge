import { createHash } from 'node:crypto';
import { assessCapabilityGap, createToolBuildBrief } from './self-extension-engine.js';

const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','then','when','where','what','into','your','you',
  'build','run','failed','failure','error','command','task','please','cannot','could','not','was',
  'are','is','to','of','in','on','a','an','by','as','at','or','be','it','after','before',
]);

const CAPABILITY_RULES = [
  { capability: 'android-build', pattern: /android|gradle|apk|aab|kotlin|sdkmanager/i },
  { capability: 'web-frontend', pattern: /vite|react|vue|svelte|frontend|browser|html|css|javascript/i },
  { capability: 'web-backend', pattern: /node|npm|express|fastify|api|backend|server/i },
  { capability: 'python-tooling', pattern: /python|pip|pytest|wheel|pypi/i },
  { capability: 'database-engineering', pattern: /postgres|sqlite|mysql|database|sql|migration/i },
  { capability: 'container-engineering', pattern: /docker|podman|container|image build/i },
  { capability: 'testing-automation', pattern: /playwright|selenium|test|spec|assertion|e2e/i },
  { capability: 'developer-tooling', pattern: /compiler|linker|toolchain|binary|executable|command not found/i },
];

function boundedText(value, limit = 5000) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function deriveCapabilities(request, failureText) {
  const source = request + '\\n' + failureText;
  const capabilities = CAPABILITY_RULES
    .filter(rule => rule.pattern.test(source))
    .map(rule => rule.capability);
  return [...new Set(capabilities.length ? capabilities : ['developer-tooling'])].slice(0, 6);
}

function deriveKeywords(request, failureText, maxKeywords = 10) {
  const words = (request + ' ' + failureText).match(/[\\p{L}\\p{N}][\\p{L}\\p{N}._+/-]{2,}/gu) ?? [];
  const unique = [];
  const seen = new Set();
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (STOP_WORDS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(word.slice(0, 80));
    if (unique.length >= maxKeywords) break;
  }
  return unique;
}

export function classifyEngineeringFailure(failure = {}) {
  const text = [
    boundedText(failure.error, 2000),
    boundedText(failure.stderr, 4000),
    boundedText(failure.stdout, 1500),
  ].join('\\n');
  const rules = [
    ['MISSING_DEPENDENCY', /cannot find module|module not found|command not found|no such file or directory|package .* not found|unable to locate package/i],
    ['VERSION_CONFLICT', /eresolve|dependency tree|version conflict|peer dep|incompatible version|could not resolve/i],
    ['NETWORK_OR_REGISTRY', /enotfound|econnreset|etimedout|network error|connection refused|registry|dns lookup|tls handshake/i],
    ['PERMISSION_OR_SANDBOX', /permission denied|operation not permitted|read-only file system|access is denied|not allowed/i],
    ['RESOURCE_EXHAUSTION', /out of memory|heap limit|no space left|disk quota|resource temporarily unavailable|killed/i],
    ['TEST_FAILURE', /assertionerror|test failed|tests? failing|expected .* (?:received|but got)|playwright.*failed/i],
    ['BUILD_OR_COMPILATION', /syntaxerror|compilation failed|build failed|cannot compile|linker error|gradle.*failed/i],
  ];
  const matched = rules.find(([, pattern]) => pattern.test(text));
  return {
    category: matched?.[0] ?? 'UNKNOWN',
    exitCode: Number.isInteger(failure.exitCode) ? failure.exitCode : null,
    command: typeof failure.command === 'string' ? failure.command.slice(0, 200) : null,
    message: text.slice(0, 5000),
  };
}

export class SelfHealingEngineeringEngine {
  constructor({ discoveryService, memoryStore = null, maxKeywords = 10 } = {}) {
    if (!discoveryService || typeof discoveryService.discover !== 'function') {
      throw new TypeError('discoveryService.discover is required');
    }
    if (memoryStore && typeof memoryStore.loadRelevant !== 'function') {
      throw new TypeError('memoryStore.loadRelevant must be a function');
    }
    if (!Number.isInteger(maxKeywords) || maxKeywords < 1 || maxKeywords > 20) {
      throw new RangeError('maxKeywords must be between 1 and 20');
    }
    this.discoveryService = discoveryService;
    this.memoryStore = memoryStore;
    this.maxKeywords = maxKeywords;
  }

  async investigate({ request, failure, previousAttempts = [] } = {}) {
    if (typeof request !== 'string' || !request.trim()) throw new TypeError('request is required');
    if (!failure || typeof failure !== 'object' || Array.isArray(failure)) throw new TypeError('failure evidence is required');
    if (!Array.isArray(previousAttempts)) throw new TypeError('previousAttempts must be an array');

    const classified = classifyEngineeringFailure(failure);
    const failureText = classified.message || boundedText(failure.command);
    const fingerprintInput = [
      classified.category,
      String(classified.exitCode ?? ''),
      String(classified.command ?? ''),
      failureText.toLowerCase().replace(/\\s+/g, ' ').trim(),
    ].join('|');
    const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');
    const duplicateFailure = previousAttempts.some(item => item?.fingerprint === fingerprint);
    const capabilities = deriveCapabilities(request, failureText);
    const keywords = deriveKeywords(request, failureText, this.maxKeywords);

    if (duplicateFailure) {
      return {
        status: 'REPEATED_FAILURE',
        fingerprint,
        duplicateFailure: true,
        failure: classified,
        capabilities,
        keywords,
        alternatives: [],
        internalToolBuild: null,
        memoryLessons: [],
        nextActions: ['COMPARE_WITH_PREVIOUS_ATTEMPT', 'CHANGE_APPROACH_OR_INPUT'],
        discovery: { status: 'SKIPPED_DUPLICATE', complete: false, candidateCount: 0 },
      };
    }

    const [discoveryResult, memoryResult] = await Promise.allSettled([
      this.discoveryService.discover({
        capabilities,
        keywords,
        queryOffset: 0,
        queryPage: 1,
        includeVendorSeeds: false,
      }),
      this.memoryStore
        ? this.memoryStore.loadRelevant({ request, capabilities })
        : Promise.resolve({}),
    ]);
    const discovery = discoveryResult.status === 'fulfilled' && discoveryResult.value
      ? discoveryResult.value
      : { status: 'DISCOVERY_ERROR', complete: false, results: [], error: discoveryResult.reason?.message ?? 'discovery unavailable' };
    const memory = memoryResult.status === 'fulfilled' ? memoryResult.value ?? {} : {};
    const results = Array.isArray(discovery.results) ? discovery.results : [];
    const capabilityGapDecisions = capabilities.map(capability => assessCapabilityGap({ capability, discovery }));
    const alternatives = results
      .filter(item => {
        const evaluation = item?.evaluation ?? item?.gateEvaluation;
        return evaluation?.eligible === true && evaluation?.status === 'CANDIDATE';
      })
      .slice(0, 12)
      .map(item => ({
        fullName: item.fullName ?? item.repository?.fullName ?? null,
        htmlUrl: item.htmlUrl ?? item.html_url ?? null,
        license: item.license ?? null,
        capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
        evaluation: item.evaluation ?? item.gateEvaluation,
      }));

    const completeDiscovery = discovery.complete === true
      && discovery.queryCatalogComplete !== false
      && discovery.candidateEvaluationComplete === true;
    const buildDecisions = capabilityGapDecisions.filter(item => item.action === 'BUILD_INTERNAL_TOOL');
    const unresolvedEvaluation = capabilityGapDecisions.some(item => item.action === 'EVALUATE_DISCOVERED_CANDIDATES');
    const reusable = capabilityGapDecisions.some(item => item.action === 'REUSE_VERIFIED_TOOL');
    let status;
    let internalToolBuild = null;
    let nextActions;

    if (reusable && alternatives.length) {
      status = 'ALTERNATIVES_FOUND';
      nextActions = ['COMPARE_VERIFIED_ALTERNATIVES', 'TRY_COMPATIBLE_ALTERNATIVE', 'RUN_REGRESSION_TESTS'];
    } else if (unresolvedEvaluation) {
      status = 'CANDIDATES_REQUIRE_EVALUATION';
      nextActions = ['EVALUATE_OPEN_SOURCE_CANDIDATES', 'CHECK_LICENSE_AND_DEPENDENCIES', 'RUN_COMPATIBILITY_TESTS'];
    } else if (completeDiscovery && buildDecisions.length === capabilities.length) {
      status = 'INTERNAL_TOOL_BUILD_REQUIRED';
      internalToolBuild = createToolBuildBrief({
        capability: capabilities.join(', '),
        task: request,
        evidence: [{
          failure: classified,
          discoveryStatus: discovery.status ?? 'UNKNOWN',
          candidatesConsidered: results.length,
          rejectedCandidates: buildDecisions.flatMap(item => item.rejectedCandidates ?? []),
          quarantinedCandidates: buildDecisions.flatMap(item => item.quarantinedCandidates ?? []),
        }],
      });
      nextActions = ['SPECIFY_MINIMAL_TOOL_INTERFACE', 'BUILD_WITHIN_APPROVED_SCOPE', 'ADD_UNIT_AND_INTEGRATION_TESTS', 'VERIFY_AND_RECORD_LESSONS'];
    } else {
      status = 'DISCOVERY_CONTINUATION_REQUIRED';
      nextActions = ['CONTINUE_OPEN_SOURCE_DISCOVERY', 'PRESERVE_FAILURE_EVIDENCE', 'TRY_A_DIFFERENT_DIAGNOSTIC_PATH'];
    }

    const lessons = Array.isArray(memory.lessons) ? memory.lessons
      : Array.isArray(memory.previousFailures) ? memory.previousFailures : [];
    return {
      status,
      fingerprint,
      duplicateFailure: false,
      failure: classified,
      capabilities,
      keywords,
      alternatives,
      capabilityGapDecisions,
      internalToolBuild,
      memoryLessons: lessons.slice(0, 12),
      nextActions,
      discovery: {
        status: discovery.status ?? 'UNKNOWN',
        complete: discovery.complete === true,
        queryCatalogComplete: discovery.queryCatalogComplete === true,
        candidateEvaluationComplete: discovery.candidateEvaluationComplete === true,
        candidateCount: results.length,
        remainingQueries: discovery.remainingQueries ?? null,
        rateLimit: discovery.rateLimit ?? null,
        error: discovery.error ?? null,
      },
    };
  }
}
