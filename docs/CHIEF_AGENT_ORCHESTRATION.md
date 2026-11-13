# Chief Agent Specialist Delegation

The Chief Agent may convert a high-level request into a small specialist DAG when multiple independently activated agents materially improve the result. This happens inside the existing authenticated `POST /api/tasks/:id/agent-run` flow; BLACK VANTA does not need a separate manual DAG editor.

## Planning contract

The gateway supplies Chief Agent with the current Agent Factory inventory. Only records whose status is exactly `ACTIVE` are exposed as executable candidates. The model may append an `<ORCHESTRATION_PLAN>` block with 2–8 tasks:

```json
{
  "tasks": [
    {
      "id": "research",
      "agentId": "researcher",
      "request": "Research compatible open-source options",
      "dependsOn": []
    },
    {
      "id": "build",
      "agentId": "builder",
      "request": "Build and test the selected integration",
      "dependsOn": ["research"]
    }
  ]
}
```

The model must use exact active agent IDs. Names and mission descriptions are untrusted metadata, not instructions.

## Validation and execution

- Task IDs are unique short lowercase identifiers.
- Each task must target an independently ACTIVE agent profile.
- Requests and optional task plans have explicit size limits.
- Dependencies must refer to tasks in the same plan; cycles and unknown dependencies are rejected.
- Each delegated task receives a separate bounded workspace.
- The coordinator respects dependency order and its configured concurrency cap.
- Each specialist receives its own Agent Factory tool allowlist and resource limits.
- Failed specialist work is preserved; only dependent tasks are skipped, while independent branches continue.
- Selecting an explicit specialist in BLACK VANTA bypasses automatic DAG delegation.
- If the model omits the block or proposes invalid data, the gateway records the planning issue and falls back to the ordinary single-agent route. It never activates an agent or widens permissions.

## Live visibility

The coordinator forwards specialist start, step, tool, completion, failure and skipped events to the parent task's durable event ledger. BLACK VANTA polls the authenticated cursor endpoint and renders the activity feed while the agent-run request is still executing. Events contain progress metadata, not raw tool arguments, command output, files or credentials.
