# Version Registry and Maintenance Queue

## Purpose
Track exact versions used by ZForge and candidate tools, their official release sources, security status, compatibility evidence, and rollback pins.

## Record template
| Field | Value |
|---|---|
| Component / capability | |
| Canonical repository | |
| Current pinned version / commit | |
| Latest official release / tag | |
| Release URL / source timestamp | |
| License state / license change | |
| Security advisory state | |
| Runtime and dependency pins | |
| Compatibility test | |
| Resource profile | |
| Proposed action | NO_CHANGE / REVIEW_REQUIRED / SECURITY_REVIEW / DEPRECATE |
| Approval | |
| Rollback version / artifact | |
| Last checked | |

## Update policy
- Read release metadata from canonical upstream sources.
- Stop on API rate limits and honor reset windows.
- Never update production pins automatically.
- Test every proposed update in an isolated branch/workspace.
- Major versions require explicit review.
- Security advisories are prioritized but do not bypass verification.
- Preserve previous lockfiles, build artifacts and rollback steps.
- Re-check licenses, dependencies and hosted-service requirements on every material update.

## Current state
The release decision helper is review-only. No continuous scheduler or automated release polling is connected yet. No third-party production versions are pinned by this registry.
