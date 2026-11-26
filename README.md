# ZForge

**Zubair Autonomous Engineering Forge** — an open-source, zero-budget engineering platform for planning, orchestrating, executing, and verifying software tasks through agent workflows.

[![Quality Gate](https://github.com/zopair/ZForge/actions/workflows/ci.yml/badge.svg)](https://github.com/zopair/ZForge/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/zopair/ZForge/actions/workflows/pages.yml/badge.svg)](https://github.com/zopair/ZForge/actions/workflows/pages.yml)

**GitHub Pages demo URL:** [BLACK VANTA — ZForge](https://zopair.github.io/ZForge/) (deployment target; verify the latest Pages workflow run for current availability)  
**Source:** [github.com/zopair/ZForge](https://github.com/zopair/ZForge)

> **Project status:** Active proof of concept / MVP. The repository contains implemented planning, agent orchestration, task-gateway, workspace, and execution components. It is not presented as a fully autonomous, production-hardened hosted service. See [implementation status and limits](#7-live-demo--screenshots) and the architecture documents before deployment.

## 1. Project Overview & Problem Statement

Engineering work often spans disconnected tools for research, planning, coding, testing, and delivery. ZForge explores a unified workflow that turns a natural-language request into a reviewable plan, delegates bounded work to specialist agents, executes in a workspace, and returns inspectable results.

The project has two main surfaces:

- **BLACK VANTA:** a responsive, Arabic-first Progressive Web App (PWA) for conversation and task handoff.
- **ZForge runtime:** a Node.js service that coordinates the conversational core, Chief Agent, specialist factory, workspace manager, task gateway, model adapter, and execution services.

The platform supports two execution paths:

1. **GitHub Actions cloud handoff:** the static PWA prepares an owner-scoped GitHub Issue. After the repository owner submits it, an event-triggered workflow provisions a disposable runner, executes a bounded task, and posts a result comment with artifacts.
2. **Optional self-hosted runtime:** an operator can run the Node.js gateway locally or on their own host and connect the PWA to it.

**Who benefits:** developers exploring agent-assisted software delivery, engineering teams prototyping multi-agent workflows, and researchers evaluating reproducible, evidence-based automation.

**Core problem addressed:** reducing the gap between an AI-generated plan and a verifiable engineering result—without requiring a paid API or a permanent hosted backend.

## 2. Tech Stack & Versions

Versions below are taken from the repository manifests and workflows. Where the repository does not pin a version, that is stated rather than guessed.

| Area | Technology | Detected version / policy |
|---|---|---|
| Application language | JavaScript (ES modules) | No separate compiler/transpiler |
| Runtime | Node.js | `>=20` in `package.json`; CI and Pages use Node.js `24` |
| Front end | HTML5, CSS3, browser JavaScript | No frontend framework declared |
| PWA | Web App Manifest, Service Worker, browser APIs | Native browser platform |
| Runtime APIs | Node.js built-in modules and HTTP server | No runtime npm dependencies declared |
| Automated tests | Node.js built-in test runner | `node --test` |
| Browser smoke tests | Playwright | `1.56.1`, installed in CI without saving to the project manifest |
| Auxiliary voice adapter | Python | Python 3 syntax-checked in CI; exact minor version is not pinned |
| Local model integration | Ollama adapter | External local service; Ollama version is not pinned in this repository |
| Cloud execution model | Qwen2.5 1.5B | Apache-2.0 model downloaded by the cloud workflow |
| Cloud build image | Node.js, JDK, Android SDK, Python | Node.js 24, JDK 21, Android SDK 35 in the worker image |
| CI/CD | GitHub Actions | Workflow actions are version-tagged in `.github/workflows/` |
| Static hosting | GitHub Pages | Static PWA; not a persistent application server |

No npm runtime package dependencies are declared in the current `package.json`.

## 3. Prerequisites & Dependencies

### Static PWA

- A modern browser with JavaScript, Service Worker, and PWA support.
- Internet access to load the GitHub Pages deployment.
- No Node.js installation, local model, API key, or environment variable is required to open the static interface.

### Automated checks

- Node.js 20 or newer and npm.
- Python 3 for the auxiliary KemeTone adapter syntax check.
- For browser smoke tests: Playwright 1.56.1 and Chromium, Firefox, and WebKit browser binaries.

### Optional self-hosted runtime

- Node.js 20 or newer.
- A private gateway token of at least 16 characters.
- Ollama and a locally available model for model-driven tasks.
- Optional Podman or Docker when using the container execution backend.
- Optional JDK and Android SDK for Android build tasks.
- Optional local voice binaries/models (whisper.cpp, FFmpeg, Piper, and/or KemeTone) for voice features.

The cloud worker provisions its own temporary toolchain on a GitHub-hosted runner. GitHub Actions is ephemeral and quota-limited; it is not an always-on server.

## 4. Installation & Local Setup (Step-by-Step)

### A. Clone and inspect

```bash
git clone https://github.com/zopair/ZForge.git
cd ZForge
node --version
npm --version
```

Use Node.js 20 or newer. The repository currently declares no npm runtime dependencies, so an `npm install` is not required for the core test suite.

### B. Run the automated tests

```bash
npm test
```

### C. Serve the static PWA locally

From the repository root, run:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). This serves the static interface only; it does not start the ZForge runtime or provide agent execution by itself.

### D. Start the optional self-hosted runtime

Set a private token in the shell, then start the service:

**Linux / macOS**
```bash
export ZFORGE_GATEWAY_TOKEN='replace-with-a-random-token-of-at-least-16-characters'
npm start
```

**PowerShell**
```powershell
$env:ZFORGE_GATEWAY_TOKEN = "replace-with-a-random-token-of-at-least-16-characters"
npm start
```

The gateway defaults to `127.0.0.1:8787`. Configure the optional runtime URL in BLACK VANTA to connect the PWA. Do not expose the gateway publicly without an appropriate deployment and access-control review.

### E. Optional container backend

Set `ZFORGE_EXECUTION_BACKEND=container` and configure the container engine (Podman by default). The selected engine must already be installed and available to the service account. Review [Task Gateway and Local Execution Runtime](docs/TASK_GATEWAY.md) and [Architecture](docs/ARCHITECTURE.md) before enabling it.

## 5. Environment Variables

### Required for the self-hosted runtime

| Variable | Description | Safe example |
|---|---|---|
| `ZFORGE_GATEWAY_TOKEN` | Bearer token; minimum 16 characters | `replace-with-a-random-token-16chars-min` |

### Optional runtime configuration

| Variable | Purpose | Default |
|---|---|---|
| `ZFORGE_HOST` | Gateway bind address | `127.0.0.1` |
| `ZFORGE_PORT` | Gateway port | `8787` |
| `ZFORGE_DATA_DIR` | Persistent task/agent data directory | `./.zforge-data` |
| `ZFORGE_WORKSPACE_DIR` | Agent workspace directory | `./.zforge-workspaces` |
| `ZFORGE_ARTIFACT_DIR` | Artifact storage directory | `./.zforge-artifacts` |
| `ZFORGE_REPO_ROOT` | Repository root used for prompts and memory | Current working directory |
| `ZFORGE_MODEL` | Local model name | `qwen3:8b` |
| `OLLAMA_BASE_URL` | Ollama endpoint | `http://127.0.0.1:11434` |
| `GITHUB_TOKEN` | Optional token for GitHub discovery operations | Unset (unauthenticated discovery) |
| `ZFORGE_ALLOWED_ORIGINS` | Comma-separated allowed browser origins | `https://zopair.github.io` |
| `ZFORGE_EXECUTION_BACKEND` | `local` or `container` execution adapter | `local` |
| `ZFORGE_AGENT_MAX_STEPS` | Maximum tool-loop steps | `16` |
| `ZFORGE_MAX_PARALLEL_AGENTS` | Parallel agent limit | Defined by runtime fallback |
| `ZFORGE_MODEL_REQUEST_TIMEOUT_MS` | Model request timeout | `60000` |
| `ZFORGE_WEB_BUILD_TIMEOUT_MS` | Web build timeout | `840000` |
| `ZFORGE_BROWSER_VERIFY_TIMEOUT_MS` | Browser verification timeout | `30000` |
| `ZFORGE_ANDROID_BUILD_TIMEOUT_MS` | Android build timeout | `840000` |
| `ZFORGE_VOICE_TIMEOUT_MS` | Voice request timeout | `120000` |
| `ZFORGE_KEMETONE_TIMEOUT_MS` | KemeTone request timeout | `300000` |

### Optional container settings

| Variable | Default |
|---|---|
| `ZFORGE_CONTAINER_ENGINE` | `podman` |
| `ZFORGE_CONTAINER_IMAGE` | `node:24-bookworm-slim` |
| `ZFORGE_CONTAINER_NETWORK` | `bridge` |
| `ZFORGE_CONTAINER_CPUS` | `2` |
| `ZFORGE_CONTAINER_MEMORY` | `4g` |
| `ZFORGE_CONTAINER_PIDS` | `256` |
| `ZFORGE_CONTAINER_TMPFS` | `1g` |

### Optional Android and voice tool paths

| Variable | Purpose |
|---|---|
| `ANDROID_HOME`, `ANDROID_SDK_ROOT` | Android SDK location |
| `JAVA_HOME` | JDK location |
| `ZFORGE_WHISPER_BIN`, `ZFORGE_WHISPER_MODEL` | whisper.cpp executable and model path |
| `ZFORGE_FFMPEG_BIN` | FFmpeg executable |
| `ZFORGE_PIPER_BIN`, `ZFORGE_PIPER_MODEL` | Piper command and voice model path |
| `ZFORGE_KEMETONE_PYTHON`, `ZFORGE_KEMETONE_DIR` | KemeTone Python executable and model directory |
| `ZFORGE_KEMETONE_ESPEAK_BIN`, `ZFORGE_KEMETONE_ESPEAK_LIB` | eSpeak-NG executable and optional library path |

`PATH` is inherited from the host environment. The static GitHub Pages interface requires **no environment variables**. Never commit real tokens, model credentials, or private runtime configuration.

## 6. Usage Guide & Core Features

1. Open BLACK VANTA and start a conversation in the chat interface.
2. Ask a question or describe an engineering task. The conversational core routes dialogue separately from execution requests.
3. For an execution request, review the proposed task plan and approval boundary documented by the project.
4. Use the configured execution path:
   - With the optional self-hosted runtime, connect the gateway from the runtime settings.
   - Without a connected runtime, the PWA prepares a GitHub Issue handoff. Review the issue content and submit it while signed in as the repository owner.
5. Follow the workflow result comment and download any generated artifacts before their retention period expires.

### Main capabilities represented in the codebase

- Conversational core, intent routing, and capability registry.
- Chief Agent planning and specialist-agent factory.
- Dependency-aware multi-agent task coordination.
- Local repository memory, task history, and engineering issue ledger.
- Authenticated task gateway with durable task state and progress events.
- Local or optional container-backed workspace execution.
- Repository/tool discovery and evidence-oriented tool evaluation.
- Web build and Chromium/Firefox/WebKit verification services.
- Android debug build worker and artifact handling.
- Optional local speech-to-text and text-to-speech adapters.
- GitHub Actions cloud task handoff with bounded, disposable execution.

### Important operational boundaries

- GitHub Pages serves a static PWA; it is not a persistent backend.
- Cloud execution is event-triggered and asynchronous. The PWA does not provide a live in-page result stream for the GitHub Issue handoff.
- Cloud task issues are public. Never include secrets, personal data, or confidential source material in them.
- Cloud artifacts have a seven-day retention period in the documented workflow.
- The local process runner is not an OS sandbox. Use a dedicated unprivileged account or the optional container backend.
- Android release signing and iOS build workers are not implemented as complete release paths.
- A successful workflow or test run is not proof of production readiness.

See [Cloud Execution Fabric](docs/CLOUD_EXECUTION.md), [Task Gateway](docs/TASK_GATEWAY.md), and [Architecture](docs/ARCHITECTURE.md) for implementation boundaries.

## 7. Live Demo & Screenshots

- **GitHub Pages deployment target:** [https://zopair.github.io/ZForge/](https://zopair.github.io/ZForge/) (the workflow is configured; current public reachability was not independently confirmed during this review)
- **Repository:** [https://github.com/zopair/ZForge](https://github.com/zopair/ZForge)
- **Cloud execution design:** [docs/CLOUD_EXECUTION.md](docs/CLOUD_EXECUTION.md)

The Pages workflow deploys the static site from `main` and runs a live smoke check after deployment. If the demo is temporarily unavailable, inspect the latest [Pages workflow run](https://github.com/zopair/ZForge/actions/workflows/pages.yml).

### Screenshots

The Playwright browser-smoke workflow captures the initial BLACK VANTA interface at desktop (1440×1000) and mobile (390×844) viewports. After a successful or partially completed browser-smoke job, open the workflow run and download the `zforge-ui-screenshots` artifact. Artifacts are retained for 14 days and are not committed to the source tree.

These captures document the initial interface only; they do not represent a completed live agent task or certify every browser interaction.

## 8. Testing & Verification

### Local checks

```bash
npm test
node --check src/core/cloud-task-contract.js
node --check src/runtime/server.js
node --check scripts/run-cloud-task.mjs
node --check scripts/run-cloud-conversation.mjs
node --check src/core/cloud-conversation-bridge.js
node --check scripts/post-cloud-task-result.mjs
node --check assets/cloud-execution.js
python3 -m py_compile scripts/kemetone-inference.py
```

### Browser smoke tests

The CI workflow installs the pinned Playwright runner and browser binaries, then runs:

```bash
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install --with-deps chromium firefox webkit
node scripts/browser-smoke.mjs
```

### GitHub verification

- Pull requests and pushes to the configured branches run the [Quality Gate](.github/workflows/ci.yml).
- The [Pages deployment workflow](.github/workflows/pages.yml) publishes the static PWA and runs `scripts/pages-live-smoke.mjs`.
- Cloud execution is exercised through the owner-scoped issue workflow; inspect the workflow run and resulting issue comment rather than assuming a task succeeded.

## Proof of Concept & Enterprise Customization Readiness

**Status:** Active PoC / MVP; suitable for technical review and controlled experimentation. Not certified or claimed as production-ready.

Potential enterprise customization areas include identity integration, policy configuration, persistent job scheduling, isolated execution infrastructure, artifact retention controls, observability, SBOM/provenance generation, and organization-specific approval workflows. These are extension areas, not claims that those capabilities are already complete.

## Intellectual Property & Authorship

Project authorship and original implementation: **Aly Hussein Zopair (علي حسين زبير ALY HUSSEIN ZOPAIR)**.

ZForge is an independently developed proof of concept. Third-party components, models, libraries, and assets remain subject to their respective licenses and notices. Review the repository's license and provenance records before redistribution or commercial deployment.
