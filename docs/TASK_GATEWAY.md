# ZForge Local Task Gateway and Execution Runtime

## Components

- `TaskStore`: durable JSON task ledger, atomic file replacement, state transitions and event history.
- `createTaskGateway`: Node.js HTTP API with bearer authentication and bounded JSON request bodies.
- `LocalExecutionRuntime`: self-hosted workspaces and process execution using argument arrays (`shell:false`), per-process timeout, output cap and concurrency limit.
- `server.js`: environment-configured process entry point.

## Start

Use Node.js 20+; no npm dependencies are required.

```sh
export ZFORGE_GATEWAY_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
export ZFORGE_HOST=127.0.0.1
export ZFORGE_PORT=8787
export ZFORGE_DATA_DIR="$PWD/.zforge-data"
export ZFORGE_WORKSPACE_DIR="$PWD/.zforge-workspaces"
npm start
```

The default listener is loopback-only. To reach it remotely, put it behind a TLS reverse proxy and configure network exposure deliberately. Never expose the raw HTTP listener to the public internet. Keep the bearer token server-side; do not embed it in GitHub Pages assets.

## API

All endpoints except health require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness response; contains no secret |
| GET | `/api/tasks` | List durable task records |
| POST | `/api/tasks` | Create a queued task: `{ "request": "...", "workspaceId": "..." }` |
| GET | `/api/tasks/:id` | Read task state and event history |
| PATCH | `/api/tasks/:id` | Apply a valid lifecycle transition |
| POST | `/api/workspaces` | Create a workspace: `{ "id": "..." }` |
| POST | `/api/tasks/:id/execute` | Run an explicit command in that task's workspace |

Execution body example:

```json
{
  "command": "node",
  "args": ["--version"],
  "cwd": ".",
  "timeoutMs": 30000
}
```

Commands are launched with `shell:false`; pass executable and arguments separately. Environment variables are minimal by default; callers may pass explicit string values. Output is capped. Task records survive process restarts.

## Execution model and responsibility

This is a local host process runner, not a container sandbox. A process inherits the operating-system identity and filesystem/network reach of the ZForge service account. Run it under a dedicated unprivileged account or inside a disposable container/VM with only the intended workspace mounted. Do not run it as root or expose it directly to untrusted networks.

The API currently accepts explicit command invocations from an authenticated caller. It does not yet autonomously translate Chief Agent plans into tool calls, stream events to BLACK VANTA, or provision Android signing/build infrastructure. Those are separate integration phases.

## Data and recovery

- Task records live in `ZFORGE_DATA_DIR/tasks.json`; back up this directory.
- Workspaces live in `ZFORGE_WORKSPACE_DIR`; retain or clean them according to your experiment policy.
- Never commit runtime data, tokens, generated artifacts or user workspaces.
- Preserve failed and inconclusive task records for engineering memory.
