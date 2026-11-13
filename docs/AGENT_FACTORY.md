# ZForge Agent Factory

## Lifecycle

An agent manifest is never executable when first proposed. The lifecycle is:

1. **PROPOSED** — validate identity, mission, non-goals, tool declarations, permissions, resource limits and rollback plan.
2. **TESTING** — collect five required test results: representative, edge, adversarial, missing-dependency and quota-exhaustion.
3. **REVIEW** — an independent reviewer records license, security and permission review.
4. **APPROVAL_REQUIRED** — all gates are satisfied, but no activation has occurred.
5. **ACTIVE** — a separate approver explicitly activates the agent.
6. **RETIRED** — explicit rollback/deactivation; retired agents cannot receive execution profiles.

The author cannot review their own agent. The activation approver must be distinct from both the author and reviewer. The agent cannot self-activate or grant itself privileged actions.

## Manifest shape

The manifest follows the contract enforced by `validateAgentManifest` in `src/core/agent-architect.js`. Tool declarations use the execution tool ID where a built-in tool is intended, for example `run_command`, `read_file`, `write_file`, `list_files` or `publish_artifact`.

Permission mapping:

| Execution tool | Required allow permission |
|---|---|
| `run_command` | `test:run` or `code:execute` |
| `read_file`, `list_files` | `workspace:read` |
| `write_file` | `workspace:write` |
| `publish_artifact` | `artifact:publish` |
| `finish_task` | Mandatory internal completion capability |

Denied permissions always override allow permissions. Tools requiring a permission listed in `approvalRequired` are withheld from the effective profile. Unknown tool IDs are reported as unavailable and are not silently mapped to another tool.

## HTTP workflow

All routes require the gateway bearer token.

- `POST /api/agents` with `{ "manifest": { ... }, "authorId": "..." }`
- `POST /api/agents/:id/tests` with `{ "testName": "representative", "status": "passed", "evidence": "CI run URL or artifact ID", "recordedBy": "ci" }`
- Repeat for all five required tests.
- `POST /api/agents/:id/reviews` with `{ "reviewerId": "...", "licenseVerified": true, "securityReviewed": true, "permissionsReviewed": true }`
- `POST /api/agents/:id/activate` with `{ "approved": true, "approverId": "..." }`
- `GET /api/agents/:id/profile` returns the effective execution tool allowlist and resource ceilings.
- `POST /api/agents/:id/deactivate` with `{ "approved": true, "approverId": "...", "reason": "..." }` rolls back an active agent.

BLACK VANTA lists only ACTIVE agents in its specialist selector. The Chief Agent remains the default route when no specialist is selected.

## Persistence

Agent proposals, test evidence, reviews, activation and deactivation metadata are stored in `ZFORGE_DATA_DIR/agents.json`. Back up this file with the task ledger.

## Resource boundaries

Per-agent process timeouts and file/artifact size limits are enforced by the execution service. The container backend applies the lower of the global and agent-specific CPU/RAM limits. The current `storageMb` policy limits individual file/artifact operations; aggregate workspace disk quotas are not yet enforced. The local host backend does not enforce per-agent CPU/RAM isolation.
