# ZForge Local Task Gateway and Execution Runtime

## Components

- `TaskStore`: durable JSON task ledger, atomic file replacement, state transitions and event history.
- `createTaskGateway`: Node.js HTTP API with bearer authentication and bounded JSON request bodies.
- `LocalExecutionRuntime`: per-task self-hosted workspaces, file operations and process execution using argument arrays (`shell:false`), per-process timeout, output cap and concurrency limit.
- `AgentExecutionService`: local Ollama tool-call loop; successful, failed and inconclusive experiment outcomes are recorded through `AgentWorkspaceManager`.
- `LocalTaskHistoryMemoryStore`: feeds recent task outcomes back into Chief Agent planning context.
- `ContainerExecutionRuntime`: optional Podman/Docker backend with a read-only container root, workspace-only writable mount, CPU/RAM/PID limits and configurable bridge/none networking.
- `LocalArtifactStore`: durable binary artifacts with SHA-256 integrity verification and authenticated downloads.
- `AgentFactory` + `LocalAgentRegistry`: durable agent proposals, required test evidence, independent reviews, explicit activation approval and per-agent execution profiles.
- `server.js`: environment-configured process entry point.

## Start

Use Node.js 20+; no npm dependencies are required.

```sh
export ZFORGE_GATEWAY_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
export ZFORGE_HOST=127.0.0.1
export ZFORGE_PORT=8787
export ZFORGE_DATA_DIR="$PWD/.zforge-data"
export ZFORGE_WORKSPACE_DIR="$PWD/.zforge-workspaces"
export ZFORGE_REPO_ROOT="$PWD"
export ZFORGE_MODEL=qwen3:8b
export ZFORGE_ALLOWED_ORIGINS=https://zopair.github.io
export ZFORGE_ARTIFACT_DIR="$PWD/.zforge-artifacts"
# Optional isolated backend; local is the default.
# export ZFORGE_EXECUTION_BACKEND=container
# export ZFORGE_CONTAINER_ENGINE=podman
# export ZFORGE_CONTAINER_IMAGE=node:24-bookworm-slim
# export ZFORGE_CONTAINER_NETWORK=bridge
# Optional: a GitHub token increases public API search quota; keep it server-side only.
# export GITHUB_TOKEN=...
npm start
```

The default listener is loopback-only. To reach it remotely, put it behind a TLS reverse proxy and configure network exposure deliberately. Never expose the raw HTTP listener to the public internet. Keep the bearer token server-side; do not embed it in GitHub Pages assets. `ZFORGE_ALLOWED_ORIGINS` is an exact comma-separated origin list; the default permits `https://zopair.github.io` for the BLACK VANTA Pages UI.

## API

All endpoints except health require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness response; contains no secret |
| GET | `/api/models` | List installed Ollama models |
| GET | `/api/agents` | List agent proposals and active agents |
| POST | `/api/agents` | Propose a manifest; starts in `PROPOSED` |
| POST | `/api/agents/:id/tests` | Record one required test result and evidence |
| POST | `/api/agents/:id/reviews` | Record independent license/security/permission review |
| POST | `/api/agents/:id/activate` | Activate only after all gates and a separate approver |
| GET | `/api/agents/:id/profile` | Read an active agent's effective tool/resource profile |
| GET | `/api/artifacts` | List stored build artifacts |
| GET | `/api/artifacts/:id` | Read artifact metadata |
| GET | `/api/artifacts/:id/download` | Download artifact bytes (bearer token required) |
| GET | `/api/tasks` | List durable task records |
| POST | `/api/tasks` | Create a queued task: `{ "request": "..." }`; a unique workspace is generated unless `workspaceId` is supplied |
| GET | `/api/tasks/:id` | Read task state and event history |
| PATCH | `/api/tasks/:id` | Apply a valid lifecycle transition |
| POST | `/api/workspaces` | Create a workspace: `{ "id": "..." }` |
| POST | `/api/tasks/:id/execute` | Run an explicit command in that task's workspace |
| POST | `/api/tasks/:id/agent-run` | Run Chief Agent planning followed by the local model tool loop; requires `confirmExecution: true` |

Execution body example:

```json
{
  "command": "node",
  "args": ["--version"],
  "cwd": ".",
  "timeoutMs": 30000
}
```

Commands are launched with `shell:false`; pass executable and arguments separately. Environment variables are minimal by default; callers may pass explicit string values. Output is capped. Task records survive process restarts. Each task receives its own workspace ID by default, preventing unrelated tasks from sharing a working directory.

## Execution model and responsibility

This is a local host process runner, not a container sandbox. A process inherits the operating-system identity and filesystem/network reach of the ZForge service account. Run it under a dedicated unprivileged account or inside a disposable container/VM with only the intended workspace mounted. Do not run it as root or expose it directly to untrusted networks.

The `agent-run` endpoint invokes Chief Agent planning (repository memory + durable task-history memory + bounded GitHub discovery + canonical prompt), then passes the plan to the local Ollama tool loop. If an `agentId` is supplied, it must already be ACTIVE; the Agent Factory applies its effective tool allowlist and resource ceilings. Agent activation requires all five manifest tests, license/security/permission reviews by an independent reviewer, and explicit approval from a third identity distinct from author and reviewer. Agent proposals and approvals persist in `agents.json`. The workspace manager records tool observations and succeeded/failed/inconclusive experiment outcomes in the current runtime process; the task ledger preserves the durable task and evidence history across restarts. Available tools are `run_command`, `read_file`, `write_file`, `list_files`, `publish_artifact` and evidence-backed `finish_task`. Build outputs such as APK/AAB, web bundles and reports can be stored with SHA-256 checksums; BLACK VANTA displays authenticated download links. A task is marked succeeded only when the model cites successful tool-result IDs. Otherwise it remains inconclusive. The BLACK VANTA PWA can connect to this API, discover installed models, submit tasks and display the result.

The local backend is not an isolated sandbox. The optional container backend uses Podman or Docker with a read-only image filesystem, only the task workspace mounted writable, dropped Linux capabilities, no-new-privileges, CPU/RAM/PID limits and selectable bridge/none networking. Per-agent CPU and memory ceilings are applied within the global container limits; `storageMb` currently limits individual file/artifact operations, not aggregate workspace disk usage. Prefer rootless Podman. A container is not a substitute for host patching or a dedicated service account. Live streaming/SSE, a multi-agent scheduler, autonomous Agent Architect activation, voice, Android/iOS build/signing and full release automation remain pending.

## Data and recovery

- Task records live in `ZFORGE_DATA_DIR/tasks.json`; back up this directory.
- Workspaces live in `ZFORGE_WORKSPACE_DIR`; each task receives a separate workspace by default.
- Artifacts live in `ZFORGE_ARTIFACT_DIR`; each published file has a recorded SHA-256 checksum.
- Never commit runtime data, tokens, generated artifacts or user workspaces.
- Preserve failed and inconclusive task records for engineering memory.
