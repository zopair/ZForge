import { spawn } from 'node:child_process';
import { access, constants, mkdtemp, writeFile, readFile, lstat, stat, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep, delimiter } from 'node:path';
import { randomUUID } from 'node:crypto';

const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
]);
const MAX_TEXT_LENGTH = 8000;

function runLocalProcess({ command, args, input = null, cwd, timeoutMs, maxOutputBytes, extraEnv = {} }) {
  return new Promise((resolveResult, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let outputBytes = 0;
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { PATH: process.env.PATH ?? '', HOME: cwd, TMPDIR: cwd, LANG: 'C.UTF-8', ...extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolveResult(value);
    };
    const collect = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('local voice process exceeded its output limit'));
        return target;
      }
      return Buffer.concat([target, chunk]);
    };
    child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
    child.stdin.on('error', () => {});
    child.once('error', error => finish(new Error('could not start local voice executable: ' + error.message)));
    child.once('close', (code, signal) => {
      if (code !== 0) return finish(new Error('local voice executable failed (' + (signal ?? code) + '): ' + stderr.toString('utf8').slice(0, 1200)));
      finish(null, { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('local voice process timed out'));
    }, timeoutMs);
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function executableAvailable(command) {
  if (typeof command !== 'string' || !command.trim()) return false;
  const candidates = command.includes('/') || command.includes('\\')
    ? [resolve(command)]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

async function regularModelFile(path) {
  if (!path) return false;
  try { return (await stat(path)).isFile(); }
  catch { return false; }
}

async function assertModelFile(path, label) {
  if (!path) throw new Error(label + ' is not configured');
  const info = await stat(path);
  if (!info.isFile()) throw new Error(label + ' must point to a regular local model file');
  return resolve(path);
}

export class LocalVoiceService {
  constructor({
    whisperCommand = 'whisper-cli',
    whisperModelPath = null,
    ffmpegCommand = 'ffmpeg',
    piperCommand = 'python3',
    piperModelPath = null,
    kemetonePythonCommand = 'python3',
    kemetoneModelDir = null,
    kemetoneEspeakCommand = 'espeak-ng',
    kemetoneEspeakLib = null,
    kemetoneTimeoutMs = 300000,
    maxKemetoneWords = 400,
    timeoutMs = 120000,
    maxAudioBytes = 25 * 1024 * 1024,
    maxSynthesizedBytes = 50 * 1024 * 1024,
    maxConvertedAudioBytes = 50 * 1024 * 1024,
    maxOutputBytes = 2 * 1024 * 1024,
  } = {}) {
    for (const [name, value] of Object.entries({ timeoutMs, maxAudioBytes, maxSynthesizedBytes, maxConvertedAudioBytes, maxOutputBytes })) {
      if (!Number.isInteger(value) || value < 1) throw new RangeError(name + ' must be a positive integer');
    }
    if (typeof whisperCommand !== 'string' || !whisperCommand.trim() || typeof ffmpegCommand !== 'string' || !ffmpegCommand.trim() || typeof piperCommand !== 'string' || !piperCommand.trim()) throw new TypeError('local voice executable names must be non-empty strings');
    this.whisperCommand = whisperCommand;
    this.whisperModelPath = whisperModelPath ? resolve(whisperModelPath) : null;
    this.ffmpegCommand = ffmpegCommand;
    this.piperCommand = piperCommand;
    this.piperModelPath = piperModelPath ? resolve(piperModelPath) : null;
    this.kemetonePythonCommand = kemetonePythonCommand;
    this.kemetoneModelDir = kemetoneModelDir ? resolve(kemetoneModelDir) : null;
    this.kemetoneEspeakCommand = kemetoneEspeakCommand;
    this.kemetoneEspeakLib = kemetoneEspeakLib ? resolve(kemetoneEspeakLib) : null;
    this.kemetoneTimeoutMs = kemetoneTimeoutMs;
    this.maxKemetoneWords = maxKemetoneWords;
    this.readinessSnapshot = null;
    this.timeoutMs = timeoutMs;
    this.maxAudioBytes = maxAudioBytes;
    this.maxSynthesizedBytes = maxSynthesizedBytes;
    this.maxConvertedAudioBytes = maxConvertedAudioBytes;
    this.maxOutputBytes = maxOutputBytes;
  }

  capabilities() {
    return {
      transcription: Boolean(this.whisperModelPath),
      synthesis: Boolean(this.piperModelPath),
      localOnly: true,
      engines: { transcription: this.whisperModelPath ? 'whisper.cpp' : null, synthesis: this.piperModelPath ? 'Piper' : null },
    };
  }

  async inspectCapabilities() {
    const checks = {
      whisperExecutable: await executableAvailable(this.whisperCommand),
      whisperModel: await regularModelFile(this.whisperModelPath),
      ffmpegExecutable: await executableAvailable(this.ffmpegCommand),
      piperInterpreter: await executableAvailable(this.piperCommand),
      piperModel: await regularModelFile(this.piperModelPath),
      piperConfig: await regularModelFile(this.piperModelPath ? this.piperModelPath + '.json' : null),
      piperModule: false,
    };
    if (checks.piperInterpreter) {
      const directory = await mkdtemp(join(tmpdir(), 'zforge-piper-check-'));
      try {
        await runLocalProcess({
          command: this.piperCommand,
          args: ['-c', 'import piper'],
          cwd: directory,
          timeoutMs: Math.min(this.timeoutMs, 15000),
          maxOutputBytes: 32768,
        });
        checks.piperModule = true;
      } catch {
        checks.piperModule = false;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    const transcription = checks.whisperExecutable && checks.whisperModel && checks.ffmpegExecutable;
    const synthesis = checks.piperInterpreter && checks.piperModule && checks.piperModel && checks.piperConfig;
    const issues = [];
    if (!checks.whisperExecutable) issues.push('whisper.cpp executable is missing or not executable');
    if (!checks.whisperModel) issues.push('Whisper model file is missing');
    if (!checks.ffmpegExecutable) issues.push('FFmpeg is required for browser microphone audio');
    if (!checks.piperInterpreter) issues.push('Piper Python interpreter is missing or not executable');
    if (checks.piperInterpreter && !checks.piperModule) issues.push('Piper Python module is not installed in the configured interpreter');
    if (!checks.piperModel) issues.push('Piper ONNX voice model is missing');
    if (checks.piperModel && !checks.piperConfig) issues.push('Piper ONNX JSON sidecar config is missing');
    return {
      transcription,
      synthesis,
      localOnly: true,
      engines: { transcription: transcription ? 'whisper.cpp' : null, synthesis: synthesis ? 'Piper' : null },
      checks,
      issues,
    };
  }

  async transcribe({ audio, contentType } = {}) {
    if (!this.whisperModelPath) throw new Error('local whisper.cpp transcription is not configured');
    if (!Buffer.isBuffer(audio) || audio.length === 0) throw new TypeError('audio payload must be a non-empty Buffer');
    if (audio.length > this.maxAudioBytes) throw new RangeError('audio payload exceeds the configured size limit');
    const mediaType = typeof contentType === 'string' ? contentType.split(';', 1)[0].trim().toLowerCase() : '';
    const extension = AUDIO_TYPES.get(mediaType);
    if (!extension) throw new TypeError('unsupported audio content type');
    const model = await assertModelFile(this.whisperModelPath, 'whisper.cpp model');
    const directory = await mkdtemp(join(tmpdir(), 'zforge-whisper-'));
    const inputPath = join(directory, 'input-' + randomUUID() + '.' + extension);
    try {
      await writeFile(inputPath, audio, { flag: 'wx', mode: 0o600 });
      let whisperInputPath = inputPath;
      if (extension !== 'wav') {
        const convertedPath = join(directory, 'normalized.wav');
        await runLocalProcess({
          command: this.ffmpegCommand,
          args: ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', convertedPath],
          cwd: directory,
          timeoutMs: this.timeoutMs,
          maxOutputBytes: this.maxOutputBytes,
        });
        const convertedInfo = await lstat(convertedPath);
        if (convertedInfo.isSymbolicLink() || !convertedInfo.isFile() || convertedInfo.size < 44 || convertedInfo.size > this.maxConvertedAudioBytes) throw new Error('FFmpeg did not produce a valid WAV file within the configured size limit');
        const convertedRealPath = await realpath(convertedPath);
        if (!convertedRealPath.startsWith(directory + sep)) throw new Error('FFmpeg output escaped its temporary directory');
        const header = await readFile(convertedRealPath);
        if (header.subarray(0, 4).toString() !== 'RIFF' || header.subarray(8, 12).toString() !== 'WAVE') throw new Error('FFmpeg output is not a valid WAV file');
        whisperInputPath = convertedRealPath;
      }
      const result = await runLocalProcess({
        command: this.whisperCommand,
        args: ['-m', model, '-f', whisperInputPath, '-nt', '-np'],
        cwd: directory,
        timeoutMs: this.timeoutMs,
        maxOutputBytes: this.maxOutputBytes,
      });
      const text = result.stdout.trim();
      if (!text) throw new Error('whisper.cpp returned an empty transcript');
      return { text, engine: 'whisper.cpp', local: true };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async synthesize({ text } = {}) {
    if (!this.piperModelPath) throw new Error('local Piper speech synthesis is not configured');
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) throw new TypeError('synthesis text must contain 1..8000 characters');
    const model = await assertModelFile(this.piperModelPath, 'Piper voice model');
    const directory = await mkdtemp(join(tmpdir(), 'zforge-piper-'));
    const outputPath = join(directory, 'speech.wav');
    try {
      await runLocalProcess({
        command: this.piperCommand,
        args: ['-m', 'piper', '-m', model, '-f', outputPath, '--', text.trim()],
        cwd: directory,
        timeoutMs: this.timeoutMs,
        maxOutputBytes: this.maxOutputBytes,
      });
      const info = await lstat(outputPath);
      if (info.isSymbolicLink() || !info.isFile() || info.size < 12 || info.size > this.maxSynthesizedBytes) throw new Error('Piper did not produce a valid WAV file within the configured size limit');
      const actual = await realpath(outputPath);
      if (!actual.startsWith(directory + sep)) throw new Error('Piper output escaped its temporary directory');
      const audio = await readFile(actual);
      if (audio.subarray(0, 4).toString() !== 'RIFF' || audio.subarray(8, 12).toString() !== 'WAVE') throw new Error('Piper output is not a valid WAV file');
      return { audio, contentType: 'audio/wav', engine: 'Piper', local: true };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
