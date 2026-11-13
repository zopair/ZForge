# Universal Open-Source Discovery Engine (ZUOI)

## Purpose

ZUOI is the evidence-first discovery subsystem of ZForge. Its job is to find, inspect, compare, verify, compose, and maintain software tools for a concrete workload. It is not a static favorites list and it must not select tools because of stars, forks, branding, sponsored placement, or search rank.

**Hard project invariant:** zero budget and open source only. No paid API, paid SaaS, subscription, credit-based service, trial quota, or proprietary runtime may become a required dependency. A public repository is not automatically open source. A free tier is not automatically sustainable.

## Coverage taxonomy

The discovery catalogue is intentionally broad and extensible. Each domain is searched by task, behavior, interface, language, runtime, and synonyms—not only by project name.

1. Cloud and computing: IaaS/PaaS alternatives, compute, distributed systems, virtualization, containers, Kubernetes, networking, storage, edge, serverless, infrastructure-as-code, schedulers, observability.
2. GitHub and source hosting: GitHub REST/GraphQL, CLI, Apps, Actions, runners, Octokit, webhooks, branch/commit/release automation, code search, repository metadata, security and dependency APIs.
3. Full-stack: frontend, backend, databases, SQL/NoSQL, API, GraphQL, ORM, authentication, authorization, realtime, queues, file/object storage, admin systems.
4. Web: frameworks, PWA, SSR/SSG, browser engines, accessibility, SEO, WebAssembly, WebGL, WebGPU, service workers, offline-first, testing and performance.
5. Android: Android SDK, Kotlin, Java, Jetpack Compose, Gradle, AGP, ADB, emulator, NDK, APK/AAB, signing, app bundles, test frameworks, profiling, packaging and distribution.
6. Apple/iOS: Swift, SwiftUI, compiler/toolchain, iOS simulators, build/test/signing. Host restrictions (macOS/Xcode) must be recorded; never pretend Linux CI can perform an unavailable Apple build.
7. AI and models: model weights, inference runtimes, quantization, CPU/GPU/ARM acceleration, training/fine-tuning, RAG, vector stores, embeddings, multimodal, speech, OCR, evaluation, safety and red-team tools.
8. Agents: orchestration, planning, memory, tool calling, MCP, skills, browser/computer use, coding agents, agent factories, permissions and sandboxes.
9. Graphics: SVG, Canvas, WebGL, WebGPU, 2D/3D rendering, CAD, animation, compositing, VFX, image/video/audio processing, fonts, asset pipelines and game engines.
10. Arabic and localization: Arabic shaping, bidi, RTL, typography, fonts, diacritics, transliteration, search, OCR, NLP, speech, translation, locale-aware formatting and accessibility.
11. Audio and voice: speech-to-text, text-to-speech, VAD, codecs, streaming, offline speech, noise reduction, audio editing and voice UI.
12. Security: SAST, DAST, dependency scanning, SBOM, provenance, secret scanning, container isolation, sandboxing, fuzzing, threat modeling and supply-chain security.
13. DevOps and QA: CI/CD, build systems, test automation, browser tests, mobile tests, load/performance tests, release automation, monitoring, telemetry and rollback.
14. Data engineering: ETL/ELT, workflow engines, data lakes, analytics, SQL engines, schema validation, data quality, queues and streaming.
15. Developer experience: IDEs, editors, language servers, terminals, debuggers, compilers, linters, formatters, documentation and code navigation.
16. Media production: open image, video, audio, motion graphics, transcoding, compression, fonts, icon libraries and export pipelines.

### Vendor discovery seeds

Search public repositories, not brand claims, across:
- Google: google, GoogleCloudPlatform, android, flutter, firebase, tensorflow, googlefonts.
- Anthropic: anthropics.
- Microsoft: microsoft, Azure, dotnet, microsoftgraph.
- Apple: apple, swiftlang, foundationdb.
- Meta: facebook, pytorch, meta-llama.
- xAI/X: xai-org, twitter.
- GitHub: github, cli, octokit, actions.

These organizations are discovery seeds only. Their repositories, dependencies, model weights, hosted products, and licenses are evaluated independently. Do not infer that a company's commercial API is free/open-source because it publishes some repositories.

## Search strategy

1. Convert the task into capability statements, inputs/outputs, runtime, target platforms, constraints, quality targets, and acceptance tests.
2. Generate domain and vendor queries, including synonyms, implementation terms, interface names, alternative languages, and Arabic/English variants where relevant.
3. Search GitHub repository metadata and topics; follow links to canonical upstream repositories and official documentation. Use public APIs within documented rate limits.
4. Search beyond GitHub where needed for authoritative license texts, release notes, security advisories, package registries, and platform documentation. Record source URLs and retrieval date.
5. Bound each run: explicit query budget, page/result cap, vendor-organization batch size, continuation offsets, timeout, cache TTL, and rate-limit stop behavior. Preserve query-page and organization-page cursors so truncated results can resume without silently skipping data. Never evade quotas, rotate accounts/tokens, scrape behind access controls, or use unofficial proxy services.
6. Deduplicate by canonical repository identity and compare forks against upstream. A fork is not treated as a distinct product unless it demonstrates material independent capability.
7. GitHub is too large for a truthful claim of exhaustive one-shot crawling. ZUOI covers the configured domain/topic catalogue, vendor organizations and independent public repository search in bounded resumable batches; it records incomplete windows and cursors rather than claiming every public repository has been inspected.
8. Read LICENSE and relevant per-directory licenses, model/data/font/asset licenses, dependency manifests, install scripts, CI, release history, security policy, and documented hosted-service requirements.
9. Return candidates with evidence and unknowns. Discovery never directly authorizes installation or execution.

## Strict eligibility gates

A candidate is not eligible for production composition until all are verified:
- A recognized open-source license for the code and every included component used.
- Model weights, datasets, fonts, icons, templates, and media assets have separately verified permissions.
- A viable self-hosted/local path exists.
- No required paid API, subscription, credits, commercial account, proprietary hosted control plane, or expiring trial.
- Dependencies and build chain do not silently introduce paid or closed services.
- Runtime/platform compatibility is demonstrated.
- Security review has no unresolved critical blocker.
- Combined license obligations are compatible for the intended distribution.
- Use complies with law, licenses, platform policies, and provider terms.

Unknown is not pass. Unknown license, hosted dependency, runtime, or compatibility results in QUARANTINED. Confirmed non-open-source license, required paid service, archived/dead upstream (unless a separately maintained fork is proven), or incompatible runtime results in REJECTED for the target workload.

### License handling

Use SPDX identifiers and inspect the full canonical license text. A conservative allowlist is only an initial filter, not legal advice or proof of compatibility. Do not collapse MIT, Apache, GPL, AGPL, LGPL, MPL, OFL, CC, model licenses, and data licenses into one interchangeable category. Check NOTICE, attribution, patent grants, copyleft scope, network-use clauses, trademark terms, and redistribution obligations. Never label BUSL, SSPL, Elastic License, Commons Clause, source-available, or custom restrictive terms as open source.

## Evidence and ranking

Record:
- canonical URL, owner, repository ID, default branch, pinned tag/commit, release date;
- full license evidence and per-component license findings;
- supported capabilities and explicit non-capabilities;
- runtime, architecture, OS, hardware, dependencies and install footprint;
- offline/self-hosted proof and all external-service requirements;
- security advisories, maintenance health and release cadence;
- reproducible task, environment, exact commands, expected/observed result, raw logs;
- CPU, RAM, storage, network, latency, build time and quota consumption;
- known failures, integration constraints and rollback path.

Popularity metrics may help discover a repository but contribute **zero** to evaluation score. Scores are category-specific and must be based on repeatable workloads. Do not label a candidate VERIFIED before the tests pass in a stated environment.

## Toolchain composition

A toolchain is a graph, not a popularity-ordered list. For each selected component, declare:
- capabilities provided and required;
- runtime/platform/version ranges;
- package and native dependencies;
- APIs/protocols and data formats;
- security boundary and permissions;
- license and distribution obligations;
- resource profile;
- conflicts, replacements and migration path.

Composition must verify that every required capability has a provider, all runtime/version constraints intersect, package constraints resolve, APIs/data formats connect, licenses are compatible, and no paid/closed dependency is mandatory. If a constraint is unknown, the composition is not certified. Test the composed stack end-to-end; passing individual tools does not prove the combination works.

## Update and maintenance policy

- Pin exact versions/commits for production builds.
- Monitor official tags/releases and security advisories; cache metadata and respect rate limits.
- Generate update proposals, never silently rewrite the production pin.
- Test updates in an isolated branch/workspace with unit, integration, compatibility, security and workload regression tests.
- Major updates require explicit review; security fixes are prioritized but still verified.
- Preserve prior lockfiles, tool manifests, test evidence and rollback instructions.
- Detect archived repositories, abandoned releases, license changes, ownership changes, deleted tags and compromised releases.
- Never execute untrusted install scripts or build hooks during discovery.

## Agent integration

Chief Agent calls the discovery planner when a task needs new or refreshed capabilities. It reads the registry and prior failure memory first, runs bounded searches, evaluates candidates, composes a toolchain, and produces an auditable plan. Agent Architect can propose a specialist agent only when a recurring capability gap is demonstrated. Neither agent can relax hard gates or grant itself privileges.

The current GitHub adapter is read-only discovery. It does not install repositories, execute code, create commits, or update production dependencies. Those actions belong to a future isolated execution runtime with explicit scoped permissions and approval gates.

## Current implementation status

- Implemented: domain/vendor query catalogue, conservative license classification, candidate quarantine/rejection gates, evidence-neutral ranking, toolchain requirement/conflict and exact package-pin checks, bounded cached GitHub discovery orchestration with resumable search pagination and public vendor-organization enumeration, read-only repository metadata/license/manifest inspection, official release metadata lookup, review-only release-update decisions, local Ollama adapter, draft-only Chief Agent planner, Agent Architect activation gates, bounded local memory/prompt providers, and approval-gated GitHub task-branch/file writes.
- Not implemented: automated legal interpretation of full license text, complete transitive dependency/paid-service scanner, semantic package/version-range solver, sandbox executor, model/dataset/font/asset license resolver, durable cache, continuous scheduler, GitHub write adapter, autonomous agent runtime, Android/iOS build workers, voice model runtime.
- All discovered repositories remain CANDIDATE until inspected and tested. This document does not declare any third-party project approved.
