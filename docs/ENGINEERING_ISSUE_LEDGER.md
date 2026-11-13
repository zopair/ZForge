# Unified Engineering Issue Ledger

ZForge keeps one durable, authenticated engineering issue ledger alongside task history and repository knowledge. The ledger is stored in `ZFORGE_DATA_DIR/engineering-issues.json` (default: `.zforge-data/engineering-issues.json`) and is available to Chief Agent through the composite memory provider.

## Record contract

Each issue records:

- Identity and scope: `id`, `title`, `domain`, `environment`, tool/version context.
- Reproduction: exact observed error, expected behavior, and reproducible steps.
- Impact: severity (`critical`, `high`, `medium`, `low`, `info`).
- Diagnosis: root-cause status (`unknown`, `probable`, `confirmed`) and confidence (`low`, `medium`, `high`).
- Evidence: CI runs, logs, screenshots, traces, links, and other verifiable references.
- Learning: attempted approaches and outcomes (`failed`, `inconclusive`, `succeeded`, `abandoned`), workarounds, linked issues.
- Cost: measured non-negative resource fields such as `durationMs`, `peakMemoryMb`, `storageMb`, and `networkBytes`.
- Closure: verified solution, verification evidence, and regression test references.

Unknown root causes remain explicitly unknown. An attempt is never promoted to a verified solution merely because it looks plausible.

## Lifecycle

`open → investigating → blocked → resolved → closed`

A record may move between non-terminal states as evidence changes. `resolved`, `closed`, and `wont-fix` require all of:

1. A non-empty solution summary.
2. Explicit verification evidence.
3. At least one regression-test reference.

This prevents an issue from being marked complete based only on an unverified code change.

## Authenticated API

All endpoints require `Authorization: Bearer <ZFORGE_GATEWAY_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/engineering-issues` | List records; optional `status`, `domain`, and `limit` filters |
| POST | `/api/engineering-issues` | Create an issue (starts as `open`) |
| GET | `/api/engineering-issues/:id` | Retrieve one issue |
| PATCH | `/api/engineering-issues/:id` | Update diagnosis, attempts, evidence, status, solution, or regression tests |

The API is part of the existing authenticated Task Gateway. No unauthenticated issue listing or mutation route is exposed.

## Example create payload

```json
{
  "title": "Browser smoke test fails on mobile viewport",
  "domain": "browser-qa",
  "environment": { "runtime": "GitHub Actions", "node": "24", "browser": "Chromium" },
  "exactError": "chat composer extends beyond viewport",
  "expectedBehavior": "composer is fully visible in the first viewport",
  "reproduction": "Run browser-smoke.mjs at 390x844",
  "severity": "high",
  "rootCause": {
    "status": "unknown",
    "confidence": "low",
    "description": ""
  },
  "evidence": [{ "kind": "ci-run", "reference": "workflow-run-url-or-id" }],
  "attempts": [{ "approach": "reduce panel min-height", "outcome": "inconclusive", "details": "awaiting cross-browser verification" }],
  "toolVersions": { "playwright": "pinned-version" },
  "resourceUsage": { "durationMs": 42000, "peakMemoryMb": 256 }
}
```

## Resource and integrity controls

- Default cap: 2,000 records, 8 MiB persisted file, and 8 relevant records per memory load.
- Atomic replacement and serialized writes preserve concurrent updates.
- Symlinked/non-regular state files and malformed or oversized ledgers are rejected.
- File mode is restricted to owner read/write where supported.
- Resource measurements must be finite, non-negative numbers.
- Keep credentials, access tokens, private keys, and personal secrets out of issue descriptions and evidence. Store references to protected logs rather than copying secret-bearing payloads.
- This is a local runtime ledger, not a multi-host distributed database. Use one active writer per data directory.

## Verification

The automated suite covers persistence across restart, lifecycle evidence gates, invalid inputs, concurrent writes, symlink/corrupt-state rejection, relevance bounds, and authenticated API behavior.

A record's status is evidence-scoped: a passing unit test does not prove real device, browser, voice-model, or Android-host behavior unless that environment is explicitly represented in its evidence.
