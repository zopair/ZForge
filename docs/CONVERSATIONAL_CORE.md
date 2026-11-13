# ZForge Conversational Core

## Purpose

ZForge Conversational Core is the single conversational interface for the entire platform. The user talks to ZForge, not to individual specialist agents. Agents, tools, runtimes and engineering services remain internal resources selected and coordinated by ZForge.

## Message lifecycle

1. Authenticate the request at Task Gateway.
2. Load the durable conversation session and its recent user/assistant turns.
3. Answer capability questions from the authoritative capability registry.
4. Classify the latest message as conversation or a concrete engineering request. Ambiguous messages default to conversation.
5. For conversation, generate a natural response using the local model and bounded history. No task is created and no execution tool is called.
6. For engineering requests, ask Chief Agent to prepare a draft plan using the active-agent inventory.
7. Persist the conversation and create a queued task associated with the draft.
8. Return the plan, immutable JSON snapshot and SHA-256 fingerprint to BLACK VANTA.
9. Execute only after the user explicitly approves that exact snapshot through the existing agent-run endpoint.

## Boundaries

- The user interacts only with ZForge / BLACK VANTA; the UI does not expose specialist-agent selection.
- The conversational model does not execute tools in dialogue mode.
- Invalid or uncertain intent classification falls back to dialogue, never execution.
- Capability answers are grounded in the runtime-injected registry. Available, configurable, planned and unavailable are distinct states.
- Engineering planning does not execute work.
- Approval is bound to the exact serialized plan and SHA-256 digest. A changed plan requires a new approval.
- Existing Chief Agent, Agent Factory, Multi-Agent Coordinator, Task Gateway, execution services and progress ledger remain the internal execution infrastructure.
- Conversation history is stored in conversations.json, with a bounded recent history passed to the model. The gateway token is never stored in the conversation record.

## API

- GET /api/capabilities returns the current capability registry.
- POST /api/conversation accepts a message, optional conversationId and optional model.
- A dialogue response returns mode=conversation and does not create a task.
- An engineering response returns mode=plan, taskId, approvedPlan, approvedPlanSha256, requiresApproval=true and executionStarted=false.
- The browser displays a single approval action. It submits the exact snapshot to the existing agent-run route.

## Current limitations

- Dialogue requires a configured local model runtime. Capability questions can be answered deterministically from the registry.
- The browser holds the active conversation ID in page memory; the server persists the session, but automatic session restoration after a full page reload is a later UX enhancement.
- The intent classifier is model-based and deliberately fails toward dialogue when its output is invalid or ambiguous.