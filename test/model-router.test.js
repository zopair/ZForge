import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalModelRouter } from '../src/core/model-router.js';

function adapter(models) {
  return { listModels: async () => models };
}

test('router selects the configured installed model for each specialist role', async () => {
  const router = await new LocalModelRouter({
    modelAdapter: adapter(['qwen3:8b', 'deepseek-coder:6.7b', 'gemma3:4b']),
    defaultModel: 'qwen3:8b',
    routes: { architecture: 'qwen3:8b', coding: 'deepseek-coder:6.7b', review: 'gemma3:4b' },
  }).initialize();

  assert.equal(router.resolve({ role: 'coding' }).model, 'deepseek-coder:6.7b');
  assert.equal(router.resolve({ role: 'review' }).model, 'gemma3:4b');
  assert.equal(router.resolve({ role: 'architecture' }).model, 'qwen3:8b');
});

test('router falls back when a specialist model is not installed and reports the reason', async () => {
  const router = await new LocalModelRouter({
    modelAdapter: adapter(['qwen3:8b']),
    defaultModel: 'qwen3:8b',
    routes: { coding: 'missing-coder:latest' },
  }).initialize();

  assert.deepEqual(router.resolve({ role: 'coding' }), {
    model: 'qwen3:8b',
    requestedModel: 'missing-coder:latest',
    role: 'coding',
    fallback: true,
    reason: 'configured_model_not_installed',
  });
});

test('router rejects models not present in the local runtime, including explicit overrides', async () => {
  const router = await new LocalModelRouter({
    modelAdapter: adapter(['qwen3:8b']),
    defaultModel: 'qwen3:8b',
  }).initialize();

  assert.throws(() => router.resolve({ role: 'general', preferredModel: 'remote-model' }), /not installed locally/i);
});

test('router requires a distinct installed model for independent review', async () => {
  const router = await new LocalModelRouter({
    modelAdapter: adapter(['qwen3:8b', 'gemma3:4b']),
    defaultModel: 'qwen3:8b',
    routes: { review: 'qwen3:8b' },
  }).initialize();

  assert.throws(() => router.resolveIndependentReview({ authorModel: 'qwen3:8b' }), /distinct installed model/i);
  assert.equal(router.resolveIndependentReview({ authorModel: 'qwen3:8b' }).model, 'gemma3:4b');
});

test('router rejects an empty or unavailable default model during initialization', async () => {
  await assert.rejects(
    () => new LocalModelRouter({ modelAdapter: adapter([]), defaultModel: 'qwen3:8b' }).initialize(),
    /default model.*not installed locally/i,
  );
});
