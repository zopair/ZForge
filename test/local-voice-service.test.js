import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
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
    const piper = await executable(root, 'fake-piper', 'while [ "$#" -gt 0 ]; do if [ "$1" = "--output_file" ]; then shift; output="$1"; fi; shift; done\ncat >/dev/null\nprintf "RIFF0000WAVEdata" > "$output"\n');
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
    const piper = await executable(root, 'fake-piper', 'while [ "$#" -gt 0 ]; do if [ "$1" = "--output_file" ]; then shift; output="$1"; fi; shift; done\ncat >/dev/null\nprintf "not-wave" > "$output"\n');
    const service = new LocalVoiceService({ piperCommand: piper, piperModelPath: model });
    await assert.rejects(() => service.synthesize({ text: '   ' }), /text/i);
    await assert.rejects(() => service.synthesize({ text: 'test' }), /valid WAV/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
