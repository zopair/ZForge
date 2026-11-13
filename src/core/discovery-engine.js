const DOMAINS = Object.freeze([
  { id:'cloud-computing', label:'Cloud & Computing', terms:['cloud computing','distributed systems','containers','Kubernetes','virtualization','serverless','storage','networking','infrastructure as code','edge computing'] },
  { id:'github-engineering', label:'GitHub Engineering', terms:['GitHub API','GitHub Actions','GitHub CLI','GitHub Apps','Octokit','runners','repository automation','release automation'] },
  { id:'full-stack', label:'Full-Stack Engineering', terms:['full stack framework','frontend backend','REST API','GraphQL','database','authentication','ORM','realtime','file storage'] },
  { id:'web', label:'Web Engineering', terms:['web framework','PWA','SSR','WebAssembly','WebGPU','browser automation','accessibility','web performance'] },
  { id:'android', label:'Android Engineering', terms:['Android SDK','Kotlin','Jetpack Compose','Gradle','ADB','Android emulator','APK build','AAB','Android signing','Android testing'] },
  { id:'ios-apple', label:'iOS & Apple Engineering', terms:['Swift','SwiftUI','FoundationDB','Apple developer tools','iOS build','iOS testing'] },
  { id:'ai-models', label:'AI Models & Inference', terms:['open weights model','local inference','LLM runtime','multimodal model','RAG','vector database','model quantization','model evaluation'] },
  { id:'agents', label:'Agents & Orchestration', terms:['AI agent framework','agent orchestration','MCP server','agent skills','tool calling','computer use','browser agent','agent memory'] },
  { id:'graphics', label:'Graphics & Visual Computing', terms:['SVG','Canvas','WebGL','WebGPU','Three.js','2D graphics','3D rendering','animation','visual effects','Blender'] },
  { id:'arabic-localization', label:'Arabic & Localization', terms:['Arabic shaping','Arabic typography','RTL layout','Arabic NLP','Arabic OCR','Arabic speech','Arabic search','Unicode bidi','Arabic fonts','اللغة العربية','دعم العربية','الكتابة من اليمين لليسار','خطوط عربية','تشكيل الحروف العربية','معالجة الكلام العربي'] },
  { id:'audio-voice', label:'Audio & Voice', terms:['speech to text','text to speech','voice activity detection','audio processing','streaming audio','offline speech recognition'] },
  { id:'security', label:'Security & Supply Chain', terms:['SAST','DAST','dependency scanning','SBOM','secret scanning','sandbox','container security','software supply chain'] },
  { id:'devops-qa', label:'DevOps & Quality Engineering', terms:['CI CD','test automation','Playwright','performance testing','observability','OpenTelemetry','deployment rollback','release engineering'] },
  { id:'data-engineering', label:'Data Engineering', terms:['ETL','data pipeline','data lake','analytics','Apache Arrow','DuckDB','schema validation','workflow orchestration'] },
  { id:'developer-tools', label:'Developer Experience', terms:['IDE','code editor','debugger','terminal','language server','compiler','linter','formatter','documentation generator'] },
  { id:'media-production', label:'Media Production', terms:['image processing','video editing','audio editing','media transcoding','font tooling','asset pipeline','motion graphics'] },
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
  'BSL-1.0','CC0-1.0','CDDL-1.0','CERN-OHL-P-2.0','CERN-OHL-S-2.0','ECL-2.0','EPL-1.0','EPL-2.0',
  'EUPL-1.2','GFDL-1.3-only','GPL-1.0-only','GPL-1.0-or-later','GPL-2.0-only','GPL-2.0-or-later',
  'GPL-3.0-only','GPL-3.0-or-later','ISC','LGPL-2.0-only','LGPL-2.1-only','LGPL-2.1-or-later',
  'LGPL-3.0-only','LGPL-3.0-or-later','MIT','MPL-1.1','MPL-2.0','MS-PL','MS-RL','NCSA',
  'OFL-1.1','OSL-3.0','PostgreSQL','Python-2.0','Unlicense','UPL-1.0','WTFPL','Zlib',
]);
const NON_OPEN_SOURCE_MARKERS = ['BUSL','BSL-','SSPL','ELASTIC','COMMONS-CLAUSE','SOURCE-AVAILABLE','PROPRIETARY'];

export function buildDiscoveryPlan({ capabilities = [], keywords = [], maxQueries = 48 } = {}) {
  if (!Array.isArray(capabilities) || !Array.isArray(keywords)) throw new TypeError('capabilities and keywords must be arrays');
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 200) throw new RangeError('maxQueries must be between 1 and 200');
  const requested = new Set(capabilities.map(value => String(value).toLowerCase()));
  const domains = DOMAINS.map(domain => ({ ...domain, requested: requested.has(domain.id) || domain.terms.some(term => requested.has(term.toLowerCase())) }));
  const queries = [];
  for (const domain of domains) {
    const selected = domain.requested ? domain.terms : domain.terms.slice(0, 2);
    for (const term of selected) queries.push(`(${term}) in:name,description,readme`);
  }
  for (const keyword of keywords) if (String(keyword).trim()) queries.push(`(${String(keyword).trim()}) in:name,description,readme`);
  for (const capability of capabilities) queries.push(`(${String(capability).trim()}) in:name,description,readme`);
  const deduplicated = [...new Set(queries)].slice(0, maxQueries);
  const vendorQueries = VENDORS.flatMap(vendor => vendor.orgs.map(org => `tooling org:${org}`));
  return {
    generatedAt: new Date().toISOString(),
    policy: 'public-github-search-only; open-source-and-zero-cost-gates-required; no popularity-based scoring',
    domains,
    vendorSeeds: VENDORS,
    queries: deduplicated,
    vendorQueries,
    searchSources: ['GitHub repository search API','GitHub organization repositories','GitHub topics','official project documentation','official release metadata'],
  };
}

export function classifyLicense(input) {
  const spdxId = typeof input === 'string' ? input : input?.spdxId ?? input?.spdx_id ?? null;
  if (!spdxId || typeof spdxId !== 'string' || spdxId === 'NOASSERTION') return { status:'UNKNOWN', spdxId:null, reason:'No verifiable SPDX license identifier.' };
  const normalized = spdxId.trim();
  const upper = normalized.toUpperCase();
  if (NON_OPEN_SOURCE_MARKERS.some(marker => upper.includes(marker))) return { status:'NOT_OPEN_SOURCE', spdxId:normalized, reason:'License is source-available or has non-open-source restrictions.' };
  if (OPEN_SOURCE_LICENSES.has(normalized)) return { status:'OPEN_SOURCE', spdxId:normalized, reason:'SPDX identifier is in the conservative OSI-compatible allowlist; inspect full license text and dependency licenses before integration.' };
  return { status:'UNKNOWN', spdxId:normalized, reason:'License identifier is not in the conservative allowlist; manual legal review required.' };
}

export function evaluateRepositoryCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new TypeError('candidate must be an object');
  const license = classifyLicense(candidate.license);
  const failures = [];
  const unresolved = [];
  if (candidate.archived === true) failures.push('ARCHIVED');
  if (license.status === 'NOT_OPEN_SOURCE') failures.push('NON_OPEN_SOURCE_LICENSE');
  if (candidate.paidDependency === true) failures.push('PAID_DEPENDENCY');
  if (candidate.zeroCostVerified === false) failures.push('NO_ZERO_COST_PATH');
  if (candidate.selfHosted === false) failures.push('NO_SELF_HOSTED_PATH');
  if (candidate.securityBlocked === true) failures.push('SECURITY_BLOCK');
  if (license.status === 'UNKNOWN') unresolved.push('LICENSE_UNVERIFIED');
  if (candidate.zeroCostVerified !== true && candidate.zeroCostVerified !== false) unresolved.push('ZERO_COST_UNVERIFIED');
  if (candidate.selfHosted !== true && candidate.selfHosted !== false) unresolved.push('SELF_HOSTING_UNVERIFIED');
  if (candidate.paidDependency !== true && candidate.paidDependency !== false) unresolved.push('DEPENDENCIES_UNVERIFIED');
  if (candidate.runtimeCompatible !== true && candidate.runtimeCompatible !== false) unresolved.push('RUNTIME_COMPATIBILITY_UNVERIFIED');
  if (candidate.runtimeCompatible === false) failures.push('RUNTIME_INCOMPATIBLE');
  if (candidate.licenseCompatibilityVerified !== true) unresolved.push('COMBINED_LICENSE_COMPATIBILITY_UNVERIFIED');
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
