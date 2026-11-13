# Web Build Worker

The self-hosted runtime can test and build a JavaScript web project inside its assigned workspace.

## Supported contract

- Project must contain a valid `package.json` with a non-empty `scripts.build`.
- Dependencies must already be installed in the workspace. The worker does not silently install packages or trigger dependency downloads.
- Package manager is selected from the project lockfile: pnpm, Yarn, Bun or npm; npm is the fallback when no lockfile exists.
- If `scripts.test` exists, it runs before the build unless explicitly disabled.
- The build command is invoked as an executable plus argument array, never through shell interpolation.
- Static output must be in `dist`, `build` or `out`; only regular files under that directory are eligible for publication.
- Each published file is stored in the local artifact store with SHA-256 metadata. Missing output, failed tests/builds, and output-limit violations are failures, not successful builds.

## API

`POST /api/tasks/:id/web-build`

Requires bearer authentication and `{ "confirmExecution": true }`. Optional fields:

- `projectPath`: normalized relative workspace path; defaults to `.`.
- `outputDirectory`: `dist`, `build` or `out`; defaults to `dist`.
- `runTests`: defaults to `true`.

## Limits and evidence

The worker uses the existing workspace runtime process limits and an 840-second default timeout. It publishes at most 200 files by default. A successful result proves that the declared tests (if present) and build command exited successfully and that generated static files were found and stored. It does not prove cross-browser compatibility; browser QA is a separate verification stage.
