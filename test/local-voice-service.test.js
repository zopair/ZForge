import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalVoiceService } from '../src/runtime/local-voice-service.js';

async function executable(root, name, source) {
  const path = join(root, name);
  await writeFile(path, '#!/bin/sh\n' + source, { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

test('local voice transcribes accepted audio using configured local whisper executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-stt-'));
  try {
    const model = join(root, 'whisper-model.bin');
    await writeFile(model, 'model');
    const whisper = await executable(root, 'fake-whisper', 'printf "local transcript from whisper"\n');
    const ffmpeg = await executable(root, 'fake-ffmpeg', 'for arg in "$@"; do output="$arg"; done\nprintf "RIFF0000WAVEfmt " > "$output"\ndd if=/dev/zero bs=28 count=1 >> "$output" 2>/dev/null\n');
    const service = new LocalVoiceService({ whisperCommand: whisper, whisperModelPath: model, ffmpegCommand: ffmpeg });
    const result = await service.transcribe({ audio: Buffer.from('fake-webm-audio'), contentType: 'audio/webm;codecs=opus' });
    assert.equal(result.text, 'local transcript from whisper');
    assert.equal(result.engine, 'whisper.cpp');
    assert.equal(result.local, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice accepts WAV directly without requiring FFmpeg', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-wav-'));
  try {
    const model = join(root, 'whisper-model.bin');
    await writeFile(model, 'model');
    const whisper = await executable(root, 'fake-whisper', "printf '%s\\n' 'wav transcript'\n");
    const service = new LocalVoiceService({ whisperCommand: whisper, whisperModelPath: model, ffmpegCommand: join(root, 'ffmpeg-not-installed') });
    const result = await service.transcribe({ audio: Buffer.from('RIFF0000WAVEdata'), contentType: 'audio/wav' });
    assert.equal(result.text, 'wav transcript');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice synthesizes a WAV file through configured local Piper executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-tts-'));
  try {
    const model = join(root, 'voice.onnx');
    await writeFile(model, 'model');
    const piper = await executable(root, 'fake-piper', 'if [ "$1" = "-c" ]; then exit 0; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-f" ]; then shift; output="$1"; fi; shift; done\nprintf "RIFF0000WAVEdata" > "$output"\n');
    const service = new LocalVoiceService({ piperCommand: piper, piperModelPath: model });
    const result = await service.synthesize({ text: 'مرحبا بالعالم' });
    assert.equal(result.contentType, 'audio/wav');
    assert.equal(result.audio.subarray(0, 4).toString(), 'RIFF');
    assert.equal(result.audio.subarray(8, 12).toString(), 'WAVE');
    assert.equal(result.engine, 'Piper');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice rejects unsupported audio, empty payloads and missing local models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-invalid-'));
  try {
    const model = join(root, 'whisper-model.bin');
    await writeFile(model, 'model');
    const whisper = await executable(root, 'fake-whisper', 'printf "transcript"\n');
    const service = new LocalVoiceService({ whisperCommand: whisper, whisperModelPath: model, maxAudioBytes: 32 });
    await assert.rejects(() => service.transcribe({ audio: Buffer.from('x'), contentType: 'application/json' }), /unsupported audio/i);
    await assert.rejects(() => service.transcribe({ audio: Buffer.alloc(0), contentType: 'audio/wav' }), /audio payload/i);
    await assert.rejects(() => service.transcribe({ audio: Buffer.alloc(33), contentType: 'audio/wav' }), /size limit/i);
    const unavailable = new LocalVoiceService();
    await assert.rejects(() => unavailable.transcribe({ audio: Buffer.from('x'), contentType: 'audio/wav' }), /not configured/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice refuses blank synthesis text and rejects missing WAV output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-bad-tts-'));
  try {
    const model = join(root, 'voice.onnx');
    await writeFile(model, 'model');
    const piper = await executable(root, 'fake-piper', 'if [ "$1" = "-c" ]; then exit 0; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-f" ]; then shift; output="$1"; fi; shift; done\nprintf "not-wave" > "$output"\n');
    const service = new LocalVoiceService({ piperCommand: piper, piperModelPath: model });
    await assert.rejects(() => service.synthesize({ text: '   ' }), /text/i);
    await assert.rejects(() => service.synthesize({ text: 'test' }), /valid WAV/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice readiness checks executables, model files and Piper sidecar config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-readiness-'));
  try {
    const whisperModel = join(root, 'ggml-small.bin');
    const piperModel = join(root, 'ar_JO-kareem-medium.onnx');
    const whisper = await executable(root, 'whisper-cli', 'exit 0\n');
    const ffmpeg = await executable(root, 'ffmpeg', 'exit 0\n');
    const python = await executable(root, 'python-voice', 'if [ "$1" = "-c" ]; then exit 0; fi\nexit 0\n');
    await writeFile(whisperModel, 'whisper model');
    await writeFile(piperModel, 'piper model');
    await writeFile(piperModel + '.json', '{}');
    const service = new LocalVoiceService({
      whisperCommand: whisper,
      whisperModelPath: whisperModel,
      ffmpegCommand: ffmpeg,
      piperCommand: python,
      piperModelPath: piperModel,
    });
    const status = await service.inspectCapabilities();
    assert.equal(status.transcription, true);
    assert.equal(status.synthesis, true);
    assert.equal(status.localOnly, true);
    assert.equal(status.checks.ffmpegExecutable, true);
    assert.equal(status.checks.piperModule, true);
    assert.equal(status.checks.piperConfig, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice readiness marks missing FFmpeg and Piper config as unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-readiness-missing-'));
  try {
    const whisperModel = join(root, 'ggml-small.bin');
    const piperModel = join(root, 'voice.onnx');
    const whisper = await executable(root, 'whisper-cli', 'exit 0\n');
    const python = await executable(root, 'python-voice', 'if [ "$1" = "-c" ]; then exit 0; fi\nexit 0\n');
    await writeFile(whisperModel, 'whisper model');
    await writeFile(piperModel, 'piper model');
    const service = new LocalVoiceService({
      whisperCommand: whisper,
      whisperModelPath: whisperModel,
      ffmpegCommand: join(root, 'missing-ffmpeg'),
      piperCommand: python,
      piperModelPath: piperModel,
    });
    const status = await service.inspectCapabilities();
    assert.equal(status.transcription, false);
    assert.equal(status.synthesis, false);
    assert.equal(status.checks.ffmpegExecutable, false);
    assert.equal(status.checks.piperConfig, false);
    assert.ok(status.issues.length >= 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local voice can synthesize Egyptian Cairene Arabic with optional KemeTone and verify its model bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-kemetone-'));
  try {
    const modelDir = join(root, 'kemetone-model');
    await mkdir(join(modelDir, 'voices'), { recursive: true });
    await mkdir(join(modelDir, 'kemetone'), { recursive: true });
    await writeFile(join(modelDir, 'config.json'), '{}');
    await writeFile(join(modelDir, 'kemetone.pth'), 'weights');
    await writeFile(join(modelDir, 'voices', 'kemetone.pt'), 'voice embedding');
    await writeFile(join(modelDir, 'example.py'), '# local example');
    const python = await executable(root, 'kemetone-python', 'if [ "$1" = "-c" ]; then exit 0; fi\\noutput="$3"\\nprintf "RIFF0000WAVEfmt " > "$output"\\ndd if=/dev/zero bs=28 count=1 >> "$output" 2>/dev/null\\n');
    const espeak = await executable(root, 'espeak-ng', 'exit 0\\n');
    const service = new LocalVoiceService({
      kemetonePythonCommand: python,
      kemetoneModelDir: modelDir,
      kemetoneEspeakCommand: espeak,
    });
    const status = await service.inspectCapabilities();
    assert.equal(status.synthesis, true);
    assert.equal(status.engines.synthesis, 'KemeTone Egyptian');
    assert.equal(status.checks.kemetoneModel, true);
    assert.equal(status.checks.kemetoneModule, true);
    const result = await service.synthesize({ text: 'النَّهَارْدَه الْجَوّ حِلْو أَوِي', engine: 'auto' });
    assert.equal(result.engine, 'KemeTone Egyptian');
    assert.equal(result.contentType, 'audio/wav');
    assert.equal(result.audio.subarray(0, 4).toString(), 'RIFF');
    assert.equal(result.audio.subarray(8, 12).toString(), 'WAVE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('automatic voice selection uses Piper for mixed Latin text and refuses unsupported text without a fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-kemetone-fallback-'));
  try {
    const modelDir = join(root, 'kemetone-model');
    await mkdir(join(modelDir, 'voices'), { recursive: true });
    await mkdir(join(modelDir, 'kemetone'), { recursive: true });
    for (const [name, content] of [['config.json', '{}'], ['kemetone.pth', 'weights'], ['voices/kemetone.pt', 'voice'], ['example.py', '# local example']]) {
      const target = join(modelDir, name);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, content);
    }
    const kemetonePython = await executable(root, 'kemetone-python', 'if [ "$1" = "-c" ]; then exit 0; fi\\nexit 0\\n');
    const espeak = await executable(root, 'espeak-ng', 'exit 0\\n');
    const piperModel = join(root, 'voice.onnx');
    await writeFile(piperModel, 'model');
    await writeFile(piperModel + '.json', '{}');
    const piper = await executable(root, 'fake-piper', 'if [ "$1" = "-c" ]; then exit 0; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-f" ]; then shift; output="$1"; fi; shift; done\nprintf "RIFF0000WAVEdata" > "$output"\n');
    const service = new LocalVoiceService({
      kemetonePythonCommand: kemetonePython,
      kemetoneModelDir: modelDir,
      kemetoneEspeakCommand: espeak,
      piperCommand: piper,
      piperModelPath: piperModel,
    });
    const result = await service.synthesize({ text: 'Build complete: 2 tasks', engine: 'auto' });
    assert.equal(result.engine, 'Piper');
    const egyptianOnly = new LocalVoiceService({
      kemetonePythonCommand: kemetonePython,
      kemetoneModelDir: modelDir,
      kemetoneEspeakCommand: espeak,
    });
    await assert.rejects(() => egyptianOnly.synthesize({ text: 'Build complete: 2 tasks', engine: 'auto' }), /Arabic-only/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
