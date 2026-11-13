import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const cloudWorkflow = await readFile(new URL('../.github/workflows/cloud-execution.yml', import.meta.url), 'utf8');
const conversationWorker = await readFile(new URL('../scripts/run-cloud-conversation.mjs', import.meta.url), 'utf8');

test('GitHub Pages deploys every push to main', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
});

test('capability questions do not require the local model inventory', () => {
  assert.match(conversationWorker, /isCapabilityQuestion/);
  assert.match(conversationWorker, /if\s*\(!isCapabilityQuestion\(request\)\)/);
  assert.match(cloudWorkflow, /needs_model/);
  assert.match(cloudWorkflow, /steps\.classify-request\.outputs\.needs_model == 'true'/);
});
