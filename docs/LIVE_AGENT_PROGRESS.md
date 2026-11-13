# Live Agent Progress Events

The Task Gateway records a bounded, append-only event history for each task and exposes cursor-based authenticated polling. The PWA uses authenticated fetch requests instead of native EventSource because EventSource does not support the gateway's bearer authorization header.

## Event API

`GET /api/tasks/:id/events?after=<sequence>`

Returns task status, events with sequence numbers greater than the cursor, and the latest cursor. The endpoint requires the same bearer token as other task operations. Each task retains at most 2,000 recent events; sequence numbers remain monotonic when older entries are trimmed.

## Emitted events

- `agent.started`, `agent.step.started`, `agent.model.response`
- `agent.tool.started`, `agent.tool.completed`
- `agent.completed`, `agent.needs_action`, `agent.failed`, `agent.step_limit`
- `agent.task.started`, `agent.task.completed`, `agent.task.failed`, `agent.task.skipped`

Events contain progress metadata only. They deliberately exclude raw tool arguments, command output, file contents, environment variables and credentials. Events are persisted before the callback returns, so a cursor can resume after a page reload or temporary network interruption while the task remains available.

## Automatic specialist delegation

When BLACK VANTA submits a task without an explicitly selected specialist, the gateway gives Chief Agent the current ACTIVE agent inventory. Chief Agent may append a structured `<ORCHESTRATION_PLAN>` containing 2–8 specialist tasks when decomposition is useful.

- Every `agentId` must match an independently ACTIVE Agent Factory profile; proposed or retired agents are not eligible.
- Task identifiers, dependencies, graph cycles, request lengths and task counts are validated before execution.
- Each delegated task receives its own bounded workspace identifier.
- The MultiAgentCoordinator executes independent tasks concurrently, respects dependency order and preserves failed/skipped branches.
- Specialist lifecycle and worker step events are appended to the same parent task ledger and rendered by the existing BLACK VANTA progress feed.
- Selecting a specific specialist explicitly bypasses automatic DAG delegation and runs only that profile.

The model-proposed plan is treated as untrusted structured output. Invalid or invented agent IDs are rejected and the gateway falls back to the normal single-agent route; no agent is activated or permission is widened by planning.
