const FORMATS = new Set(['apk', 'aab']);

function validateProjectPath(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new TypeError('projectPath must be a relative project path inside the workspace');
  }
  const segments = value.split('/');
  if (segments.some(segment => segment === '..' || segment === '')) throw new TypeError('projectPath must be a relative project path inside the workspace');
  if (segments.some(segment => segment === '.')) {
    if (value !== '.') throw new TypeError('projectPath must be a normalized relative path');
  }
  return value;
}

export class AndroidBuildService {
  constructor({ runtime, artifactStore, androidHome = null, javaHome = null, path = null, timeoutMs = 840000, maxArtifacts = 20 } = {}) {
    if (!runtime || typeof runtime.createWorkspace !== 'function' || typeof runtime.listFiles !== 'function' || typeof runtime.execute !== 'function') {
      throw new TypeError('runtime must support workspace creation, file listing and process execution');
    }
    if (!artifactStore || typeof artifactStore.publishFromWorkspace !== 'function') throw new TypeError('artifactStore.publishFromWorkspace is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new RangeError('timeoutMs must be between 1000 and 900000');
    if (!Number.isInteger(maxArtifacts) || maxArtifacts < 1 || maxArtifacts > 100) throw new RangeError('maxArtifacts must be between 1 and 100');
    this.runtime = runtime;
    this.artifactStore = artifactStore;
    this.androidHome = androidHome;
    this.javaHome = javaHome;
    this.path = path;
    this.timeoutMs = timeoutMs;
    this.maxArtifacts = maxArtifacts;
  }

  async build({ workspaceId, projectPath = '.', variant = 'debug', formats = ['apk'], runTests = true, maxArtifactBytes } = {}) {
    if (typeof workspaceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workspaceId)) throw new TypeError('workspaceId is invalid');
    const project = validateProjectPath(projectPath);
    if (variant !== 'debug') throw new Error('only the debug variant is supported by the unsigned local build worker');
    if (!Array.isArray(formats) || formats.length < 1 || formats.some(format => !FORMATS.has(format)) || new Set(formats).size !== formats.length) {
      throw new TypeError('formats must contain unique supported values: apk and/or aab');
    }
    await this.runtime.createWorkspace({ id: workspaceId });
    const files = await this.runtime.listFiles({ workspaceId, path: project, maxEntries: 5000 });
    const normalize = path => project === '.' ? path.replace(/^\.\//, '') : path;
    const projectEntries = files.map(entry => ({ ...entry, path: normalize(entry.path.replace(/\\/g, '/')) }));
    const wrapper = projectEntries.some(entry => entry.type === 'file' && (entry.path === 'gradlew' || entry.path === project + '/gradlew'));
    const settings = projectEntries.some(entry => entry.type === 'file' && /(^|\/)settings\.gradle(\.kts)?$/.test(entry.path));
    if (!wrapper) throw new Error('Gradle wrapper (gradlew) was not found in the Android project');
    if (!settings) throw new Error('Gradle settings file was not found in the Android project');
    const tasks = [];
    if (runTests) tasks.push('test');
    if (formats.includes('apk')) tasks.push('assembleDebug');
    if (formats.includes('aab')) tasks.push('bundleDebug');
    const env = {};
    if (this.androidHome) {
      env.ANDROID_HOME = this.androidHome;
      env.ANDROID_SDK_ROOT = this.androidHome;
    }
    if (this.javaHome) env.JAVA_HOME = this.javaHome;
    if (this.path) env.PATH = this.path;
    const execution = await this.runtime.execute({
      workspaceId,
      command: 'bash',
      args: [project === '.' ? './gradlew' : './' + project + '/gradlew', '--no-daemon', ...tasks],
      cwd: '.',
      env,
      timeoutMs: this.timeoutMs,
    });
    if (execution.exitCode !== 0) {
      return { status: 'failed', workspaceId, projectPath: project, variant, formats, exitCode: execution.exitCode, stdout: execution.stdout ?? '', stderr: execution.stderr ?? '', artifacts: [], error: 'Gradle build or test task failed; no artifacts were published.' };
    }
    const outputFiles = await this.runtime.listFiles({ workspaceId, path: project, maxEntries: 5000 });
    const entries = outputFiles.map(entry => ({ ...entry, path: normalize(entry.path.replace(/\\/g, '/')) }));
    const outputMarkers = [];
    if (formats.includes('apk')) outputMarkers.push('/build/outputs/apk/debug/');
    if (formats.includes('aab')) outputMarkers.push('/build/outputs/bundle/debug/');
    const outputs = entries.filter(entry => entry.type === 'file' && outputMarkers.some(marker => ('/' + entry.path).includes(marker)) && (formats.includes('apk') && entry.path.endsWith('.apk') || formats.includes('aab') && entry.path.endsWith('.aab')));
    const selected = outputs.slice(0, this.maxArtifacts);
    const missing = formats.filter(format => !selected.some(entry => format === 'apk' ? entry.path.endsWith('.apk') : entry.path.endsWith('.aab')));
    if (missing.length) {
      const format = missing[0].toUpperCase();
      return { status: 'failed', workspaceId, projectPath: project, variant, formats, exitCode: execution.exitCode, stdout: execution.stdout ?? '', stderr: execution.stderr ?? '', artifacts: [], error: format + ' output was not found after a successful Gradle run.' };
    }
    const artifacts = [];
    for (const output of selected) {
      const kind = output.path.endsWith('.apk') ? 'apk' : 'aab';
      const filename = output.path.split('/').at(-1);
      artifacts.push(await this.artifactStore.publishFromWorkspace({
        runtime: this.runtime,
        workspaceId,
        sourcePath: output.path,
        filename,
        kind,
        maxBytes: maxArtifactBytes,
      }));
    }
    return {
      status: 'succeeded',
      workspaceId,
      projectPath: project,
      variant,
      formats,
      exitCode: execution.exitCode,
      stdout: execution.stdout ?? '',
      stderr: execution.stderr ?? '',
      artifacts,
      summary: 'Gradle tests and requested debug build tasks completed; each published artifact was stored with checksum metadata.',
    };
  }
}
