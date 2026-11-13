const OUTPUT_DIRECTORIES = new Set(['dist', 'build', 'out']);
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

function validateProjectPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new TypeError('projectPath must be a relative project path inside the workspace');
  }
  const segments = value.split('/');
  if (segments.some(segment => segment === '..' || segment === '')) throw new TypeError('projectPath must be a relative project path inside the workspace');
  if (segments.some(segment => segment === '.') && value !== '.') throw new TypeError('projectPath must be a normalized relative path');
  return value;
}

function projectFile(projectPath, filename) {
  return projectPath === '.' ? filename : projectPath + '/' + filename;
}

function withinOutput(path, outputPath) {
  return path === outputPath || path.startsWith(outputPath + '/');
}

export class WebBuildService {
  constructor({ runtime, artifactStore, path = null, timeoutMs = 840000, maxArtifacts = 200, maxArtifactBytes } = {}) {
    if (!runtime || typeof runtime.createWorkspace !== 'function' || typeof runtime.listFiles !== 'function' || typeof runtime.readBuffer !== 'function' || typeof runtime.execute !== 'function') {
      throw new TypeError('runtime must support workspace creation, file listing, file reads and process execution');
    }
    if (!artifactStore || typeof artifactStore.publishFromWorkspace !== 'function') throw new TypeError('artifactStore.publishFromWorkspace is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new RangeError('timeoutMs must be between 1000 and 900000');
    if (!Number.isInteger(maxArtifacts) || maxArtifacts < 1 || maxArtifacts > 1000) throw new RangeError('maxArtifacts must be between 1 and 1000');
    this.runtime = runtime;
    this.artifactStore = artifactStore;
    this.path = path;
    this.timeoutMs = timeoutMs;
    this.maxArtifacts = maxArtifacts;
    this.maxArtifactBytes = maxArtifactBytes;
  }

  async build({ workspaceId, projectPath = '.', outputDirectory = 'dist', runTests = true } = {}) {
    if (typeof workspaceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workspaceId)) throw new TypeError('workspaceId is invalid');
    const project = validateProjectPath(projectPath);
    if (!OUTPUT_DIRECTORIES.has(outputDirectory)) throw new TypeError('outputDirectory must be one of: dist, build, out');
    await this.runtime.createWorkspace({ id: workspaceId });
    const files = await this.runtime.listFiles({ workspaceId, path: project, maxEntries: 5000 });
    const normalized = files.map(entry => ({ ...entry, path: entry.path.replace(/\\/g, '/') }));
    const packageEntry = normalized.find(entry => entry.type === 'file' && entry.path === projectFile(project, 'package.json'));
    if (!packageEntry) throw new Error('package.json was not found in the selected web project');
    const packageBytes = await this.runtime.readBuffer({ workspaceId, path: packageEntry.path, maxBytes: 1024 * 1024 });
    let manifest;
    try { manifest = JSON.parse(packageBytes.toString('utf8')); }
    catch { throw new Error('package.json is not valid JSON'); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || typeof manifest.scripts?.build !== 'string' || !manifest.scripts.build.trim()) {
      throw new Error('package.json must declare a non-empty build script');
    }
    const lockfile = LOCKFILES.find(([filename]) => normalized.some(entry => entry.type === 'file' && entry.path === projectFile(project, filename)));
    const manager = lockfile?.[1] ?? 'npm';
    const commands = [];
    const env = this.path ? { PATH: this.path } : {};
    if (runTests && typeof manifest.scripts?.test === 'string' && manifest.scripts.test.trim()) {
      const test = await this.runtime.execute({ workspaceId, command: manager, args: ['run', 'test'], cwd: project, env, timeoutMs: this.timeoutMs });
      commands.push({ task: 'test', exitCode: test.exitCode });
      if (test.exitCode !== 0) return { status: 'failed', workspaceId, projectPath: project, manager, commands, stdout: test.stdout ?? '', stderr: test.stderr ?? '', artifacts: [], error: 'Web project tests failed; build was not published.' };
    }
    const build = await this.runtime.execute({ workspaceId, command: manager, args: ['run', 'build'], cwd: project, env, timeoutMs: this.timeoutMs });
    commands.push({ task: 'build', exitCode: build.exitCode });
    if (build.exitCode !== 0) return { status: 'failed', workspaceId, projectPath: project, manager, commands, stdout: build.stdout ?? '', stderr: build.stderr ?? '', artifacts: [], error: 'Web project build failed; no artifacts were published.' };
    const outputPath = projectFile(project, outputDirectory);
    const outputs = (await this.runtime.listFiles({ workspaceId, path: outputPath, maxEntries: 5000 }))
      .map(entry => ({ ...entry, path: entry.path.replace(/\\/g, '/') }))
      .filter(entry => entry.type === 'file' && withinOutput(entry.path, outputPath))
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!outputs.length) return { status: 'failed', workspaceId, projectPath: project, manager, commands, artifacts: [], error: 'Build succeeded but the configured static output directory is missing or empty.' };
    if (outputs.length > this.maxArtifacts) return { status: 'failed', workspaceId, projectPath: project, manager, commands, artifacts: [], error: 'Build output exceeds the configured artifact count limit.' };
    const artifacts = [];
    for (const output of outputs) {
      const filename = output.path.split('/').at(-1);
      artifacts.push(await this.artifactStore.publishFromWorkspace({
        runtime: this.runtime,
        workspaceId,
        sourcePath: output.path,
        filename,
        kind: 'web',
        maxBytes: this.maxArtifactBytes,
      }));
    }
    return {
      status: 'succeeded', workspaceId, projectPath: project, outputDirectory,
      manager, commands, artifacts,
      summary: 'Web tests (when declared) and build completed; generated static files were published with SHA-256 metadata.',
    };
  }
}
