import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/app.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8');

test('BLACK VANTA exposes an active Arabic RTL chat composer and runtime connection form', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /BLACK <span>VANTA<\/span>/);
  assert.match(html, /id="chat-input"/);
  assert.match(html, /id="send-button"/);
  assert.match(html, /id="runtime-url"/);
  assert.match(html, /id="runtime-token"/);
  assert.match(html, /id="runtime-model"/);
  assert.doesNotMatch(html.match(/<input[^>]*id="chat-input"[^>]*>/)?.[0] ?? '', /\bdisabled\b/);
});

test('send control is a gold circular button with a black upward arrow', () => {
  assert.match(html, /aria-label="إرسال الرسالة"/);
  assert.match(html, /class="send-arrow"/);
  assert.match(css, /\.send-button\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.send-button\s*\{[^}]*background:\s*linear-gradient/s);
  assert.match(css, /\.send-arrow\s*\{[^}]*stroke:\s*#050505/s);
});

test('chat panel has a moving gold border, white message text and reduced-motion support', () => {
  assert.match(css, /@keyframes\s+border-glow/);
  assert.match(css, /\.chat-panel[^}]*conic-gradient/s);
  assert.match(css, /\.message-content p\s*\{[^}]*color:\s*#fff/s);
  assert.match(css, /prefers-reduced-motion/);
});

test('BLACK VANTA connects to the authenticated task and model APIs without persisting the token', () => {
  assert.match(js, /fetch\(runtimeBaseUrl\+"\/api\/health"/);
  assert.match(js, /api\("\/api\/models"\)/);
  assert.match(js, /api\("\/api\/tasks"/);
  assert.match(js, /agent-run/);
  assert.match(js, /confirmExecution:true/);
  assert.match(js, /api\\/artifacts\\//);
  assert.match(js, /URL.createObjectURL/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.match(html, /رمز الاتصال يبقى في ذاكرة الجلسة/);
});

test('PWA metadata uses BLACK VANTA identity', () => {
  assert.match(manifest, /BLACK VANTA/);
  assert.doesNotMatch(manifest, /Phantom/i);
});
