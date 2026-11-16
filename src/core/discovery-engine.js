import { CURATED_REPOSITORY_SEEDS, UNRESOLVED_REPOSITORY_REFERENCES } from './curated-repository-catalog.js';
import { AGENT_MASTER_LIBRARY_SEEDS } from './agent-master-library-catalog.js';
const DOMAINS = Object.freeze([
  { id:'cloud-computing', label:'Cloud & Computing', topics:['cloud','kubernetes','containers','distributed-systems'], terms:['cloud computing','distributed systems','containers','Kubernetes','virtualization','serverless','storage','networking','infrastructure as code','edge computing'] },
  { id:'github-engineering', label:'GitHub Engineering', topics:['github-actions','github-api','github-apps','octokit'], terms:['GitHub API','GitHub Actions','GitHub CLI','GitHub Apps','Octokit','runners','repository automation','release automation'] },
  { id:'full-stack', label:'Full-Stack Engineering', topics:['fullstack','frontend','backend','database'], terms:['full stack framework','frontend backend','REST API','GraphQL','database','authentication','ORM','realtime','file storage'] },
  { id:'web', label:'Web Engineering', topics:['web','pwa','webassembly','webgpu'], terms:['web framework','PWA','SSR','WebAssembly','WebGPU','browser automation','accessibility','web performance'] },
  { id:'android', label:'Android Engineering', topics:['android','kotlin','jetpack-compose','gradle'], terms:['Android SDK','Kotlin','Jetpack Compose','Gradle','ADB','Android emulator','APK build','AAB','Android signing','Android testing'] },
  { id:'ios-apple', label:'iOS & Apple Engineering', topics:['swift','swiftui','ios'], terms:['Swift','SwiftUI','FoundationDB','Apple developer tools','iOS build','iOS testing'] },
  { id:'ai-models', label:'AI Models & Inference', topics:['llm','local-llm','inference','rag'], terms:['open weights model','local inference','LLM runtime','multimodal model','RAG','vector database','model quantization','model evaluation'] },
  { id:'agents', label:'Agents & Orchestration', topics:['ai-agents','mcp','agent-framework','coding-agents'], terms:['AI agent framework','agent orchestration','MCP server','agent skills','tool calling','computer use','browser agent','agent memory'] },
  { id:'graphics', label:'Graphics & Visual Computing', topics:['webgl','webgpu','threejs','blender','animation'], terms:['SVG','Canvas','WebGL','WebGPU','Three.js','2D graphics','3D rendering','animation','visual effects','Blender'] },
  { id:'arabic-localization', label:'Arabic & Localization', topics:['arabic','rtl','arabic-nlp','arabic-fonts'], terms:['Arabic shaping','Arabic typography','RTL layout','Arabic NLP','Arabic OCR','Arabic speech','Arabic search','Unicode bidi','Arabic fonts','اللغة العربية','دعم العربية','الكتابة من اليمين لليسار','خطوط عربية','تشكيل الحروف العربية','معالجة الكلام العربي'] },
  { id:'audio-voice', label:'Audio & Voice', topics:['speech-to-text','text-to-speech','audio-processing'], terms:['speech to text','text to speech','voice activity detection','audio processing','streaming audio','offline speech recognition'] },
  { id:'security', label:'Security & Supply Chain', topics:['security','sast','dast','sbom'], terms:['SAST','DAST','dependency scanning','SBOM','secret scanning','sandbox','container security','software supply chain'] },
  { id:'devops-qa', label:'DevOps & Quality Engineering', topics:['devops','ci-cd','testing','playwright'], terms:['CI CD','test automation','Playwright','performance testing','observability','OpenTelemetry','deployment rollback','release engineering'] },
  { id:'data-engineering', label:'Data Engineering', topics:['data-engineering','etl','duckdb','analytics'], terms:['ETL','data pipeline','data lake','analytics','Apache Arrow','DuckDB','schema validation','workflow orchestration'] },
  { id:'developer-tools', label:'Developer Experience', topics:['developer-tools','ide','language-server','compiler'], terms:['IDE','code editor','debugger','terminal','language server','compiler','linter','formatter','documentation generator'] },
  { id:'media-production', label:'Media Production', topics:['media-processing','video-editing','image-processing','motion-graphics'], terms:['image processing','video editing','audio editing','media transcoding','font tooling','asset pipeline','motion graphics'] },
]);
const VENDORS = Object.freeze([
  { id:'google', orgs:['google','GoogleCloudPlatform','android','flutter','firebase','tensorflow','googlefonts'] },
  { id:'anthropic', orgs:['anthropics'] },
  { id:'microsoft', orgs:['microsoft','Azure','dotnet','microsoftgraph'] },
  { id:'apple', orgs:['apple','swiftlang','foundationdb'] },
  { id:'meta', orgs:['facebook','pytorch','meta-llama'] },
  { id:'xai', orgs:['xai-org','twitter'] },
  { id:'github', orgs:['github','cli','octokit','actions'] },
]);
const OPEN_SOURCE_LICENSES = new Set([
  '0BSD','AAL','AFL-3.0','AGPL-1.0-only','AGPL-1.0-or-later','AGPL-3.0-only','AGPL-3.0-or-later',
  'Apache-1.1','Apache-2.0','Artistic-2.0','BSD-2-Clause','BSD-3-Clause','BSD-3-Clause-Clear',
  'BSL-1.0','CDDL-1.0','ECL-2.0','EPL-1.0','EPL-2.0',
  'EUPL-1.2','GPL-1.0-only','GPL-1.0-or-later','GPL-2.0-only','GPL-2.0-or-later',
  'GPL-3.0-only','GPL-3.0-or-later','ISC','LGPL-2.0-only','LGPL-2.1-only','LGPL-2.1-or-later',
  'LGPL-3.0-only','LGPL-3.0-or-later','MIT','MPL-1.1','MPL-2.0','MS-PL','MS-RL','NCSA',
  'OFL-1.1','OSL-3.0','PostgreSQL','Python-2.0','Unlicense','UPL-1.0','Zlib',
]);
const NON_OPEN_SOURCE_MARKERS = ['BUSL','SSPL','ELASTIC','COMMONS-CLAUSE','SOURCE-AVAILABLE','PROPRIETARY'];
const audit = message => console.log(`[GATE] ${message}`);

export function buildDiscoveryPlan({ capabilities = [], keywords = [], maxQueries = 48 } = {}) {
  if (!Array.isArray(capabilities) || !Array.isArray(keywords)) throw new TypeError('capabilities and keywords must be arrays');
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 500) throw new RangeError('maxQueries must be between 1 and 500');
  const aliases = {'arabic-rtl':'arabic-localization','arabic':'arabic-localization','android-build':'android','android-app':'android','web-frontend':'web','web-backend':'full-stack','fullstack':'full-stack','ai-agent':'agents','llm-inference':'ai-models','graphics-3d':'graphics','voice':'audio-voice','cloud':'cloud-computing','github-automation':'github-engineering','ios-build':'ios-apple','security-testing':'security','ci-cd':'devops-qa','data-pipeline':'data-engineering'};
  const requested = new Set(capabilities.map(value => String(value).toLowerCase()));
  const requestedDomains = new Set([...requested].map(value => aliases[value] ?? value));
  const domains = DOMAINS.map(domain => ({ ...domain, requested: requestedDomains.has(domain.id) || domain.terms.some(term => requested.has(term.toLowerCase())) }));
  const queries = [];
  for (const capability of capabilities) if (String(capability).trim()) queries.push(`(${String(capability).trim()}) in:name,description,readme`);
  for (const keyword of keywords) if (String(keyword).trim()) queries.push(`(${String(keyword).trim()}) in:name,description,readme`);
  const orderedDomains = [...domains.filter(domain => domain.requested), ...domains.filter(domain => !domain.requested)];
  for (const domain of orderedDomains) {
    const selected = domain.requested ? domain.terms : domain.terms.slice(0, 2);
    for (const term of selected) queries.push(`(${term}) in:name,description,readme`);
    const selectedTopics = domain.requested ? domain.topics : domain.topics.slice(0, 1);
    for (const topic of selectedTopics) queries.push(`${topic} topic:${topic}`);
  }
  const repositorySeedMap = new Map();
  for (const seed of [...CURATED_REPOSITORY_SEEDS, ...AGENT_MASTER_LIBRARY_SEEDS]) {
    const key = seed.fullName.toLowerCase();
    const existing = repositorySeedMap.get(key);
    if (!existing) {
      repositorySeedMap.set(key, { ...seed, catalogSources: [seed.source] });
    } else {
      existing.catalogSources = [...new Set([...existing.catalogSources, seed.source])];
      if (seed.projectType) existing.projectTypes = [...new Set([...(existing.projectTypes ?? []), seed.projectType])];
    }
  }
  const allRepositorySeeds = [...repositorySeedMap.values()].map(seed => Object.freeze({
    ...seed,
    catalogSources: Object.freeze(seed.catalogSources),
    ...(seed.projectTypes ? { projectTypes: Object.freeze(seed.projectTypes) } : {}),
  }));
  const curatedRepositoryQueries = CURATED_REPOSITORY_SEEDS.map(({ fullName }) => {
    const [owner, name] = fullName.split('/');
    return `${name} in:name user:${owner}`;
  });
  const agentMasterLibraryQueries = AGENT_MASTER_LIBRARY_SEEDS.map(({ fullName }) => {
    const [owner, name] = fullName.split('/');
    return `${name} in:name user:${owner}`;
  });
  queries.push(...curatedRepositoryQueries, ...agentMasterLibraryQueries);
  const allUniqueQueries = [...new Set(queries)];
  const deduplicated = allUniqueQueries.slice(0, maxQueries);
  const vendorQueries = VENDORS.flatMap(vendor => vendor.orgs.map(org => `tooling org:${org}`));
  return {
    generatedAt: new Date().toISOString(),
    policy: 'public-github-search-only; open-source-and-zero-cost-gates-required; no popularity-based scoring',
    domains,
    vendorSeeds: VENDORS,
    curatedRepositorySeeds: CURATED_REPOSITORY_SEEDS,
    agentMasterLibrarySeeds: AGENT_MASTER_LIBRARY_SEEDS,
    agentMasterLibraryQueries,
    allRepositorySeeds,
    curatedRepositoryQueries,
    unresolvedRepositoryReferences: UNRESOLVED_REPOSITORY_REFERENCES,
    queries: deduplicated,
    totalQueryCount: allUniqueQueries.length,
    omittedQueries: allUniqueQueries.slice(maxQueries),
    queryCatalogComplete: allUniqueQueries.length <= maxQueries,
    vendorQueries,
    searchSources: ['GitHub repository search API','GitHub organization repositories','GitHub topics','official project documentation','official release metadata'],
  };
}
export function classifyLicense(input, { artifactType = 'software' } = {}) {
  const spdxId = typeof input === 'string' ? input : input?.spdxId ?? input?.spdx_id ?? null;
  if (!spdxId || typeof spdxId !== 'string' || spdxId === 'NOASSERTION') return { status:'UNKNOWN', spdxId:null, reason:'No verifiable SPDX license identifier.' };
  const normalized = spdxId.trim();
  if (normalized === 'OFL-1.1' && artifactType !== 'font') return { status:'UNKNOWN', spdxId:normalized, reason:'OFL is evaluated only for font artifacts, not software dependencies.' };
  const upper = normalized.toUpperCase();
  if (NON_OPEN_SOURCE_MARKERS.some(marker => upper.includes(marker))) return { status:'NOT_OPEN_SOURCE', spdxId:normalized, reason:'License is source-available or has non-open-source restrictions.' };
  if (OPEN_SOURCE_LICENSES.has(normalized)) return { status:'OPEN_SOURCE', spdxId:normalized, reason:'SPDX identifier is in the conservative OSI-compatible allowlist; inspect full license text and dependency licenses before integration.' };
  return { status:'UNKNOWN', spdxId:normalized, reason:'License identifier is not in the conservative allowlist; manual legal review required.' };
}

export function createCandidateRecord({ repository, capabilities = [], verification = {} } = {}) {
  if (!repository || typeof repository !== 'object') throw new TypeError('repository metadata is required');
  const candidate = {
    id: repository.id,
    fullName: repository.fullName ?? repository.full_name,
    name: repository.name,
    htmlUrl: repository.htmlUrl ?? repository.html_url,
    archived: repository.archived,
    fork: repository.fork === true, forkAheadBy: verification.forkAheadBy ?? 0, uniqueCommits: verification.uniqueCommits ?? 0, forkComparisonVerified: verification.forkComparisonVerified === true,
    pushedAt: repository.pushedAt ?? repository.pushed_at ?? null, structuralEvidence: verification.structuralEvidence ?? repository.structuralEvidence ?? {},
    license: repository.license ?? null,
    version: verification.version ?? null,
    capabilities,
    zeroCostVerified: verification.zeroCostVerified ?? null,
    selfHosted: verification.selfHosted ?? null,
    paidDependency: verification.paidDependency ?? null,
    runtimeCompatible: verification.runtimeCompatible ?? null,
    licenseCompatibilityVerified: verification.licenseCompatibilityVerified ?? null,
    licenseTextReviewed: verification.licenseTextReviewed ?? null,
    dependencyReviewComplete: verification.dependencyReviewComplete ?? null,
    securityReviewed: verification.securityReviewed ?? null,
    maintenanceReviewed: verification.maintenanceReviewed ?? null,
    versionPinned: verification.versionPinned ?? null,
    securityBlocked: verification.securityBlocked ?? null,
    provides: verification.provides ?? [], requires: verification.requires ?? [],
    conflicts: verification.conflicts ?? [], packagePins: verification.packagePins ?? {},
    evidence: verification.evidence ?? [],
  };
  return { ...candidate, evaluation: evaluateRepositoryCandidate(candidate) };
}

export function evaluateRepositoryCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new TypeError('candidate must be an object');
  const license = classifyLicense(candidate.license);
  const quality = evaluateDiscoveryQuality(candidate);
  const failures = [...quality.failures];
  const unresolved = [...quality.unresolved];
  if (candidate.archived === true) failures.push('ARCHIVED');
  if (candidate.archived !== false) unresolved.push('ARCHIVE_STATUS_UNVERIFIED');
  if (license.status === 'NOT_OPEN_SOURCE') failures.push('NON_OPEN_SOURCE_LICENSE');
  if (candidate.paidDependency === true) failures.push('PAID_DEPENDENCY');
  if (candidate.zeroCostVerified === false) failures.push('NO_ZERO_COST_PATH');
  if (candidate.selfHosted === false) failures.push('NO_SELF_HOSTED_PATH');
  if (candidate.securityBlocked === true) failures.push('SECURITY_BLOCK');
  if (candidate.securityBlocked !== false) unresolved.push('SECURITY_BLOCK_STATUS_UNVERIFIED');
  if (license.status === 'UNKNOWN') unresolved.push('LICENSE_UNVERIFIED');
  if (candidate.zeroCostVerified !== true && candidate.zeroCostVerified !== false) unresolved.push('ZERO_COST_UNVERIFIED');
  if (candidate.selfHosted !== true && candidate.selfHosted !== false) unresolved.push('SELF_HOSTING_UNVERIFIED');
  if (candidate.paidDependency !== true && candidate.paidDependency !== false) unresolved.push('DEPENDENCIES_UNVERIFIED');
  if (candidate.runtimeCompatible !== true && candidate.runtimeCompatible !== false) unresolved.push('RUNTIME_COMPATIBILITY_UNVERIFIED');
  if (candidate.runtimeCompatible === false) failures.push('RUNTIME_INCOMPATIBLE');
  if (candidate.licenseCompatibilityVerified !== true) unresolved.push('COMBINED_LICENSE_COMPATIBILITY_UNVERIFIED');
  if (candidate.licenseTextReviewed !== true) unresolved.push('LICENSE_TEXT_UNREVIEWED');
  if (candidate.dependencyReviewComplete !== true) unresolved.push('DEPENDENCY_REVIEW_INCOMPLETE');
  if (candidate.securityReviewed !== true) unresolved.push('SECURITY_REVIEW_INCOMPLETE');
  if (candidate.maintenanceReviewed !== true) unresolved.push('MAINTENANCE_REVIEW_INCOMPLETE');
  if (candidate.versionPinned !== true || typeof candidate.version !== 'string' || !candidate.version.trim()) unresolved.push('VERSION_NOT_PINNED');
  const identity = candidate.fullName ?? candidate.full_name ?? 'unknown';
  if (failures.length) {
    audit(`REJECTED ${identity}: ${failures.join(', ')}`);
    return { status:'REJECTED', eligible:false, license, quality, failures, unresolved };
  }
  if (unresolved.length) {
    audit(`QUARANTINED ${identity}: ${unresolved.join(', ')}`);
    return { status:'QUARANTINED', eligible:false, license, quality, failures, unresolved };
  }
  audit(`ACCEPTED ${identity}: all candidate-level gates clear`);
  return { status:'CANDIDATE', eligible:true, license, quality, failures, unresolved:[] };
}

export function rankCandidates(candidates, capability) {
  if (!Array.isArray(candidates) || typeof capability !== 'string' || !capability.trim()) throw new TypeError('candidates array and capability are required');
  return candidates
    .filter(candidate => (candidate.capabilities ?? []).includes(capability) && evaluateRepositoryCandidate(candidate).eligible)
    .map(candidate => ({ ...candidate, gateEvaluation:evaluateRepositoryCandidate(candidate) }))
    .sort((a,b) => {
      const metric = key => Number.isFinite(a[key]) && Number.isFinite(b[key]) ? b[key]-a[key] : 0;
      return metric('benchmarkScore') || metric('correctnessScore') || metric('maintenanceScore') || a.fullName.localeCompare(b.fullName);
    });
}

export function composeToolchain(candidates, { requiredCapabilities = [] } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const conflicts = [];
  const unresolvedRequirements = [];
  const rejected = [];
  const eligible = [];
  for (const candidate of candidates) {
    const evaluation = evaluateRepositoryCandidate(candidate);
    if (!evaluation.eligible) {
      rejected.push({ fullName:candidate.fullName ?? candidate.name ?? 'unknown', status:evaluation.status, reasons:[...evaluation.failures,...evaluation.unresolved] });
    } else eligible.push(candidate);
  }
  const provided = new Set(eligible.flatMap(item => item.provides ?? []));
  for (const candidate of eligible) {
    for (const requirement of candidate.requires ?? []) if (!provided.has(requirement)) unresolvedRequirements.push({ tool:candidate.fullName, requirement });
    for (const conflict of candidate.conflicts ?? []) if (provided.has(conflict)) conflicts.push({ tool:candidate.fullName, conflict });
  }
  for (const requirement of requiredCapabilities) if (!provided.has(requirement)) unresolvedRequirements.push({ tool:'toolchain', requirement });
  const packagePins = new Map();
  for (const candidate of eligible) {
    for (const [name, version] of Object.entries(candidate.packagePins ?? {})) {
      if (packagePins.has(name) && packagePins.get(name).version !== version) conflicts.push({ tool:candidate.fullName, conflict:`PACKAGE_VERSION_CONFLICT:${name}`, versions:[packagePins.get(name).version,version] });
      else packagePins.set(name,{version,tool:candidate.fullName});
    }
  }
  const duplicateIds = new Set();
  const seen = new Set();
  for (const item of eligible) {
    const id = item.fullName ?? item.id;
    if (seen.has(id)) duplicateIds.add(id);
    seen.add(id);
  }
  for (const id of duplicateIds) conflicts.push({ tool:id, conflict:'DUPLICATE_TOOL_ENTRY' });
  return {
    compatible: rejected.length===0 && conflicts.length===0 && unresolvedRequirements.length===0 && eligible.length===candidates.length,
    selected: eligible.map(item => item.fullName ?? item.id),
    packagePins:Object.fromEntries([...packagePins].map(([name,record])=>[name,record.version])),
    rejected, conflicts, unresolvedRequirements,
  };
}

function parseSemver(value) {
  const match = String(value ?? '').match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? { major:+match[1], minor:+match[2], patch:+match[3], prerelease:match[4] ?? null } : null;
}
export function evaluateReleaseUpdate({ current, latest, pinned = true, securityAdvisory = false } = {}) {
  if (!current || !latest) throw new TypeError('current and latest versions are required');
  const from = parseSemver(current);
  const to = parseSemver(latest);
  if (!from || !to) return { action:'MANUAL_REVIEW', automatic:false, risk:'UNKNOWN', reason:'Version is not strict semantic versioning.' };
  if (from.major===to.major && from.minor===to.minor && from.patch===to.patch && from.prerelease===to.prerelease) return { action:'NO_CHANGE', automatic:false, risk:'NONE' };
  const risk = securityAdvisory ? 'SECURITY' : to.major>from.major ? 'MAJOR' : to.minor>from.minor ? 'MINOR' : 'PATCH';
  return { action:'REVIEW_REQUIRED', automatic:false, risk, pinned, current, latest, reason:'Updates are proposed for isolated compatibility tests; no automatic production upgrade is permitted.' };
}

export const DISCOVERY_DOMAINS = DOMAINS;
export const VENDOR_SEEDS = VENDORS;

const COMMERCIAL_SERVICE_MARKERS = Object.freeze([
  { id:'openai-api', pattern:/^(openai|@openai\/)/i, reason:'OpenAI hosted API dependency may require paid credits or an account.' },
  { id:'anthropic-api', pattern:/^(anthropic|@anthropic-ai\/)/i, reason:'Anthropic hosted API dependency may require paid credits or an account.' },
  { id:'google-genai-api', pattern:/^(google-generativeai|@google\/generative-ai|@google-cloud\/aiplatform)$/i, reason:'Hosted Google AI service dependency requires account/quota verification.' },
  { id:'replicate-api', pattern:/^(replicate|@replicate\/)/i, reason:'Hosted inference API may require paid credits.' },
  { id:'fal-api', pattern:/^(fal-client|@fal-ai\/)/i, reason:'Hosted inference API may require paid credits.' },
  { id:'elevenlabs-api', pattern:/^(elevenlabs|@elevenlabs\/)/i, reason:'Hosted voice API may require paid credits.' },
  { id:'assemblyai-api', pattern:/^(assemblyai|@assemblyai\/)/i, reason:'Hosted speech API may require paid credits.' },
  { id:'deepgram-api', pattern:/^(@deepgram-sdk\/|deepgram)/i, reason:'Hosted speech API may require paid credits.' },
  { id:'pinecone-service', pattern:/^(@pinecone-database\/|pinecone-client)/i, reason:'Managed vector database service may require a paid plan.' },
  { id:'algolia-service', pattern:/^(algoliasearch|@algolia\/)/i, reason:'Hosted search service may require a paid plan.' },
  { id:'mapbox-service', pattern:/^(mapbox-gl|@mapbox\/)/i, reason:'Hosted map tiles/geocoding may require tokens and paid quota.' },
  { id:'sentry-service', pattern:/^(sentry|@sentry\/)/i, reason:'Hosted observability service requires plan/quota verification.' },
]);
const PAID_TEXT_MARKERS = /\b(?:requires?|must use|mandatory|only supported (?:through|by))\b.{0,90}\b(?:paid|subscription|credits?|billing|commercial api|saas|trial)\b|\b(?:paid|subscription|credits?|billing|commercial api|saas|trial)\b.{0,90}\b(?:required|mandatory|must)\b/i;

function dependencyNamesFromManifest(manifest) {
  const name = manifest.name ?? manifest.path ?? manifest.filename ?? '';
  const content = String(manifest.content ?? '');
  if (/package\.json$/i.test(name)) {
    try {
      const parsed = JSON.parse(content);
      return Object.keys({ ...(parsed.dependencies ?? {}), ...(parsed.optionalDependencies ?? {}), ...(parsed.peerDependencies ?? {}) });
    } catch { return null; }
  }
  if (/requirements\.txt$/i.test(name)) {
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/[<=>!~;\[]/, 1)[0].trim());
  }
  if (/pyproject\.toml$/i.test(name)) {
    return [...content.matchAll(/^\s*"([^"]+)\s*(?:[<=>!~].*)?"\s*,?\s*$/gm)].map(match => match[1].split(/[<=>!~]/,1)[0].trim());
  }
  return [];
}

/** Static-only, fail-closed commercial-service screen. No manifest or third-party code is executed. */


const PAID_ENV_MARKERS = [
  { id:'openai-api', pattern:/\b(?:OPENAI_API_KEY|OPENAI_BASE_URL)\b|api\.openai\.com/i },
  { id:'anthropic-api', pattern:/\b(?:ANTHROPIC_API_KEY|CLAUDE_API_KEY)\b|api\.anthropic\.com/i },
  { id:'google-genai-api', pattern:/\b(?:GEMINI_API_KEY|GOOGLE_API_KEY)\b|generativelanguage\.googleapis\.com/i },
  { id:'replicate-api', pattern:/\bREPLICATE_API_TOKEN\b|api\.replicate\.com/i },
  { id:'fal-api', pattern:/\bFAL_KEY\b|fal\.ai/i },
  { id:'elevenlabs-api', pattern:/\bELEVENLABS_API_KEY\b|api\.elevenlabs\.io/i },
  { id:'assemblyai-api', pattern:/\bASSEMBLYAI_API_KEY\b|api\.assemblyai\.com/i },
  { id:'deepgram-api', pattern:/\bDEEPGRAM_API_KEY\b|api\.deepgram\.com/i },
  { id:'pinecone-service', pattern:/\bPINECONE_API_KEY\b|pinecone\.io/i },
  { id:'algolia-service', pattern:/\bALGOLIA_(?:APP_ID|API_KEY)\b/i },
  { id:'mapbox-service', pattern:/\bMAPBOX_ACCESS_TOKEN\b|api\.mapbox\.com/i },
  { id:'sentry-service', pattern:/\bSENTRY_DSN\b|sentry\.io/i },
];

/** Evaluate repository quality from explicit, inspectable GitHub metadata and file evidence. */
export function evaluateDiscoveryQuality(repository, { now = Date.now(), maxInactiveDays = 365 } = {}) {
  if (!repository || typeof repository !== 'object') throw new TypeError('repository metadata is required');
  const failures = [];
  const unresolved = [];
  const fork = repository.fork === true;
  const forkAhead = Number(repository.forkAheadBy ?? repository.aheadBy ?? 0);
  const uniqueCommits = Number(repository.uniqueCommits ?? 0);
  if (fork && !(forkAhead > 0 && uniqueCommits > 0 && repository.forkComparisonVerified === true)) failures.push('FORK_NOT_SIGNIFICANTLY_AHEAD');
  if (fork && repository.forkComparisonVerified !== true) unresolved.push('FORK_COMPARISON_UNVERIFIED');
  const pushedAt = Date.parse(repository.pushedAt ?? repository.pushed_at ?? '');
  if (!Number.isFinite(pushedAt)) unresolved.push('LAST_COMMIT_ACTIVITY_UNVERIFIED');
  else if (now - pushedAt > maxInactiveDays * 86400000) failures.push('INACTIVE_OVER_12_MONTHS');
  const evidence = repository.structuralEvidence ?? {};
  if (evidence.readme === false) failures.push('README_MISSING');
  else if (evidence.readme !== true) unresolved.push('README_UNVERIFIED');
  const structuralSignals = [evidence.testsDirectory, evidence.apiDocumentation, evidence.configurationManifest];
  if (!structuralSignals.some(value => value === true)) {
    if (structuralSignals.every(value => value === false)) failures.push('STRUCTURAL_EVIDENCE_MISSING');
    else unresolved.push('STRUCTURAL_EVIDENCE_UNVERIFIED');
  }
  if (failures.length) { audit(`REJECTED ${repository.fullName ?? repository.full_name ?? 'unknown'}: ${failures.join(', ')}`); return { status:'REJECTED', eligible:false, failures, unresolved }; }
  if (unresolved.length) { audit(`QUARANTINED ${repository.fullName ?? repository.full_name ?? 'unknown'}: ${unresolved.join(', ')}`); return { status:'QUARANTINED', eligible:false, failures, unresolved }; }
  audit(`QUALITY_CLEAR ${repository.fullName ?? repository.full_name ?? 'unknown'}`);
  return { status:'QUALITY_CLEAR', eligible:true, failures:[], unresolved:[] };
}

/** Merge dependency manifests and .env.example into one fail-closed static cost assessment. */
export function inspectZeroCostDependencies(manifests = []) {
  if (!Array.isArray(manifests)) throw new TypeError('manifests must be an array');
  if (manifests.length === 0) {
    const result = { status:'QUARANTINED_UNVERIFIED', zeroCostVerified:false, paidDependency:false, dependencies:[], blocked:[], unresolved:[{ file:'(none)', reason:'No dependency manifest or environment template was inspected.' }], executionPerformed:false, limitations:['No dependency manifest was available; zero-cost requirements remain unverified.'] };
    audit('QUARANTINED: No dependency manifest or environment template was inspected');
    return result;
  }
  const dependencies = [];
  const blocked = [];
  const unresolved = [];
  for (const manifest of manifests) {
    const name = manifest.name ?? manifest.path ?? manifest.filename ?? 'unknown';
    const content = String(manifest.content ?? '');
    if (/\.env(?:\.example|\.sample|\.template)$/i.test(name)) {
      for (const marker of PAID_ENV_MARKERS) {
        if (marker.pattern.test(content)) blocked.push({
          dependency: null, service: marker.id,
          reason: 'Environment template declares a commercial-service credential or endpoint; a zero-cost path is not established.',
          file: name,
        });
      }
      if (/(?:^|\n)\s*[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|SECRET_KEY)\s*=\s*[^\s#]+/i.test(content)
        && !PAID_ENV_MARKERS.some(marker => marker.pattern.test(content))) {
        unresolved.push({ file: name, reason: 'Environment template contains a credential variable; service and pricing requirements need manual verification.' });
      }
      continue;
    }
    const names = dependencyNamesFromManifest(manifest);
    if (names === null) {
      unresolved.push({ file: name, reason: 'Manifest is malformed; dependency requirements cannot be verified.' });
      continue;
    }
    for (const dependency of names) {
      const marker = COMMERCIAL_SERVICE_MARKERS.find(item => item.pattern.test(dependency));
      if (marker) blocked.push({ dependency, service: marker.id, reason: marker.reason, file: name });
      dependencies.push(dependency);
    }
    if (PAID_TEXT_MARKERS.test(content)) blocked.push({
      dependency: null, service: 'explicit-paid-requirement',
      reason: 'Manifest contains an explicit mandatory paid-service, subscription, billing, trial, or credit requirement.',
      file: name,
    });
  }
  const result = {
    status: blocked.length ? 'REJECTED_PAID_REQUIREMENT' : unresolved.length ? 'QUARANTINED_UNVERIFIED' : 'STATIC_REVIEW_CLEAR',
    zeroCostVerified: blocked.length === 0 && unresolved.length === 0,
    paidDependency: blocked.length > 0,
    dependencies: [...new Set(dependencies)].sort(),
    blocked: [...blocked],
    unresolved: [...unresolved],
    executionPerformed: false,
    limitations: [
      'Static manifest and .env.example inspection cannot prove that all runtime paths are free. Review README, configuration, deployment requirements, and official pricing before acceptance.',
      'A declared commercial API credential is rejected even when the corresponding SDK is optional; a separately evidenced local-only mode requires human review.',
    ],
  };
  if (result.status === 'REJECTED_PAID_REQUIREMENT') audit(`REJECTED: Commercial SaaS keys or paid dependencies detected: ${blocked.map(item => `${item.file}:${item.service}`).join(', ')}`);
  else if (result.status === 'QUARANTINED_UNVERIFIED') audit(`QUARANTINED: Cost evidence incomplete: ${unresolved.map(item => `${item.file}:${item.reason}`).join('; ')}`);
  else audit(`STATIC_REVIEW_CLEAR: ${result.dependencies.length} dependencies checked; no commercial markers found`);
  return result;
}
