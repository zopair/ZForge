import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/app.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

test('Black Phantom exposes an active Arabic RTL chat composer', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /id="chat-input"/);
  assert.match(html, /id="send-button"/);
  assert.doesNotMatch(html.match(/<input[^>]*id="chat-input"[^>]*>/)?.[0] ?? '', /\bdisabled\b/);
  assert.doesNotMatch(html.match(/<button[^>]*id="send-button"[^>]*>/)?.[0] ?? '', /\bdisabled\b/);
});

test('send control is a gold circular button with a black upward arrow', () => {
  assert.match(html, /aria-label="إرسال الرسالة"/);
  assert.match(html, /class="send-arrow"/);
  assert.match(css, /\.send-button\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.send-button\s*\{[^}]*background:\s*(?:var\(--gold[^)]*\)|#[0-9a-fA-F]{3,8})/s);
  assert.match(css, /\.send-arrow\s*\{[^}]*stroke:\s*#050505/s);
});

test('chat panel has a moving, pulsing gold border and white message text', () => {
  assert.match(css, /@keyframes\s+border-glow/);
  assert.match(css, /\.chat-panel[^}]*conic-gradient/s);
  assert.match(css, /\.message-content[^}]*color:\s*(?:#fff|#f[0-9a-f]{5})/i);
  assert.match(css, /prefers-reduced-motion/);
});

test('local preview clearly distinguishes demo mode from a connected agent runtime', () => {
  assert.match(html, /وضع العرض المحلي/);
  assert.match(js, /النواة غير متصلة/);
  assert.match(js, /api\/chat/);
  assert.match(js, /لا يدّعي/);
});
