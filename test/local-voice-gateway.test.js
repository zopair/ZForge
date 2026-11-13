import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskGateway } from '../src/runtime/task-gateway.js';

test('voice gateway authenticates and routes audio to local transcription and synthesis adapters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-api-'));
  const received = {};
  const wav = Buffer.from('RIFF0000WAVEdata');
  const voiceService = {
    maxAudioBytes: 1024,
    capabilities: () => ({ transcription: true, synthesis: true, localOnly: true }),
    transcribe: async input => { received.audio = input.audio; received.contentType = input.contentType; return { text: 'local words', engine: 'whisper.cpp', local: true }; },
    synthesize: async input => { received.text = input.text; return { audio: wav, contentType: 'audio/wav' }; },
  };
  const gateway = createTaskGateway({ dataDir: root, token: 'local-voice-gateway-token', voiceService });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer local-voice-gateway-token' };
  try {
    const denied = await fetch(base + '/api/voice/capabilities');
    assert.equal(denied.status, 401);
    const capabilities = await fetch(base + '/api/voice/capabilities', { headers });
    assert.deepEqual((await capabilities.json()).capabilities, { transcription: true, synthesis: true, localOnly: true });
    const transcribed = await fetch(base + '/api/voice/transcribe', { method: 'POST', headers: { ...headers, 'Content-Type': 'audio/webm' }, body: Buffer.from('fake audio') });
    assert.equal(transcribed.status, 200);
    assert.equal((await transcribed.json()).text, 'local words');
    assert.equal(received.audio.toString(), 'fake audio');
    assert.equal(received.contentType, 'audio/webm');
    const synthesized = await fetch(base + '/api/voice/synthesize', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
    assert.equal(synthesized.status, 200);
    assert.equal(synthesized.headers.get('content-type'), 'audio/wav');
    assert.equal(Buffer.from(await synthesized.arrayBuffer()).toString(), wav.toString());
    assert.equal(received.text, 'hello');
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('voice gateway rejects oversized audio and reports missing local engines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zforge-voice-limits-'));
  const gateway = createTaskGateway({
    dataDir: root,
    token: 'local-voice-gateway-token',
    voiceService: { maxAudioBytes: 4, transcribe: async () => ({ text: 'no' }) },
  });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const headers = { Authorization: 'Bearer local-voice-gateway-token', 'Content-Type': 'audio/wav' };
  try {
    const tooLarge = await fetch(base + '/api/voice/transcribe', { method: 'POST', headers, body: Buffer.from('12345') });
    assert.equal(tooLarge.status, 413);
    const noSynthesis = await fetch(base + '/api/voice/synthesize', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
    assert.equal(noSynthesis.status, 503);
  } finally {
    await new Promise(resolve => gateway.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
