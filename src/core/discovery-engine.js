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
  { id:'apple', orgs:['apple','swiftlang','apple','foundationdb'] },
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
  const allUniqueQueries = [...new Set(queries)];
  const deduplicated = allUniqueQueries.slice(0, maxQueries);
  const vendorQueries = VENDORS.flatMap(vendor => vendor.orgs.map(org => `tooling org:${org}`));
  return {
    generatedAt: new Date().toISOString(),
    policy: 'public-github-search-only; open-source-and-zero-cost-gates-required; no popularity-based scoring',
    domains,
    vendorSeeds: VENDORS,
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
  const failures = [];
  const unresolved = [];
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
  if (failures.length) return { status:'REJECTED', eligible:false, license, failures, unresolved };
  if (unresolved.length) return { status:'QUARANTINED', eligible:false, license, failures, unresolved };
  return { status:'CANDIDATE', eligible:true, license, failures, unresolved:[] };
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
