# Toolchain Compatibility Matrix

This file records tested combinations, not theoretical compatibility. An empty matrix means no combination is certified.

## Compatibility record template
- ID / date:
- Workload and acceptance criteria:
- Components (canonical repo, pinned version/commit, capability):
- Runtime/OS/architecture:
- Language and package manager versions:
- Provided capabilities:
- Required capabilities and providers:
- Package pins and resolved dependency graph:
- API/protocol and data-format compatibility:
- Combined license review (code, dependencies, models, datasets, fonts, assets):
- Security boundary and network requirements:
- CPU/RAM/storage/build-time profile:
- Reproducible commands and environment:
- Integration tests and raw evidence:
- Conflicts/failures:
- Rollback:
- Status: PROPOSED / TESTING / VERIFIED / REJECTED
- Confidence and limitations:

## Rules
1. Do not infer compatibility from adjacent version numbers or shared language.
2. Do not certify a stack when any component is QUARANTINED or REJECTED.
3. Package pins with the same package name must resolve to one compatible version; ranges require a real resolver and lockfile evidence.
4. Runtime, OS, architecture, native libraries, build tools and platform signing requirements must match the actual target.
5. Check license compatibility for the combined distributed product, not only individual repositories.
6. API compatibility requires contract/integration tests; a matching name is not evidence.
7. A toolchain becomes VERIFIED only after the representative end-to-end workload passes in a recorded environment.
8. Any component or major version change invalidates affected compatibility evidence until re-tested.

## Current status
No third-party toolchain is certified yet. Initial composition logic checks candidate eligibility, capability providers/requirements, declared conflicts, duplicate entries and exact package-pin conflicts. It does not yet replace a full package resolver, OS/runtime solver, or legal review.
