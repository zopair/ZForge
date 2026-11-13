# ZForge Local Task Gateway and Execution Runtime

## Components

- `TaskStore`: durable JSON task ledger, atomic file replacement, state transitions and event history.
- `createTaskGateway`: Node.js HTTP API with bearer authentication and bounded JSON request bodies.
- `LocalExecutionRuntime`: per-task self-hosted workspaces, file operations and process execution using argument arrays (`shell:false`), per-process timeout, output cap and concurrency limit.
- `AgentExecutionService`: local Ollama tool-call loop; successful, failed and inconclusive experiment outcomes are recorded through `AgentWorkspaceManager`.
- `LocalTaskHistoryMemoryStore`: feeds recent task outcomes back into Chief Agent planning context.
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

The `agent-run` endpoint invokes Chief Agent planning (repository memory + durable task-history memory + bounded GitHub discovery + canonical prompt), then passes the plan to the local Ollama tool loop. The workspace manager records tool observations and succeeded/failed/inconclusive experiment outcomes in the current runtime process; the task ledger preserves the durable task and evidence history across restarts. Available tools are `run_command`, `read_file`, `write_file`, `list_files` and evidence-backed `finish_task`. A task is marked succeeded only when the model cites successful tool-result IDs. Otherwise it remains inconclusive. The BLACK VANTA PWA can connect to this API, discover installed models, submit tasks and display the result.

This is not yet an isolated sandbox. It also does not yet provide container workers, live streaming/SSE, a multi-agent scheduler, autonomous Agent Architect activation, voice, Android/iOS build/signing, or a full artifact release pipeline.

## Data and recovery

- Task records live in `ZFORGE_DATA_DIR/tasks.json`; back up this directory.
- Workspaces live in `ZFORGE_WORKSPACE_DIR`; retain or clean them according to your experiment policy.
- Never commit runtime data, tokens, generated artifacts or user workspaces.
- Preserve failed and inconclusive task records for engineering memory.
