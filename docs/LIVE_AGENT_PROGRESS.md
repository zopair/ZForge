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
