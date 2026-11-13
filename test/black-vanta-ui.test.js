import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/app.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8');

test('BLACK VANTA exposes an active Arabic RTL chat composer and runtime connection form', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /<h1 id="assistant-title">ZFORGE<\/h1>/);
  assert.match(html, /id="chat-input"/);
  assert.match(html, /id="send-button"/);
  assert.match(html, /id="runtime-url"/);
  assert.match(html, /id="runtime-token"/);
  assert.match(html, /id="runtime-model"/);
  assert.match(html, /id="android-project-path"/);
  assert.match(html, /id="android-build-button"/);
  assert.doesNotMatch(html.match(/<input[^>]*id="chat-input"[^>]*>/)?.[0] ?? '', /\bdisabled\b/);
});

test('send control is a gold circular button with a white upward arrow', () => {
  assert.match(html, /aria-label="إرسال الرسالة"/);
  assert.match(html, /class="send-arrow"/);
  assert.match(css, /\.send-button\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.send-button\s*\{[^}]*background:\s*#d9ad55/s);
  assert.match(css, /\.send-arrow\s*\{[^}]*stroke:\s*#ffffff/s);
});

test('chat panel has a moving gold border, white message text and reduced-motion support', () => {
  assert.match(css, /@keyframes\s+vanta-border-flow/);
  assert.match(css, /\.chat-panel[^}]*conic-gradient/s);
  assert.match(css, /\.message-content p,.message-content \.muted\s*\{[^}]*color:\s*#ffffff/s);
  assert.match(css, /body\s*\{[^}]*background:\s*#000000!important/s);
  assert.match(css, /\.composer\s*\{[^}]*border:\s*1px solid #d9ad55/s);
  assert.match(css, /prefers-reduced-motion/);
});

test('BLACK VANTA connects to the authenticated task and model APIs without persisting the token', () => {
  assert.match(js, /fetch\(runtimeBaseUrl\+"\/api\/health"/);
  assert.match(js, /api\("\/api\/models"\)/);
  assert.match(js, /api\("\/api\/conversation"/);
  assert.match(js, /approvedPlanSha256/);
  assert.match(js, /الموافقة على الخطة وبدء التنفيذ/);
  assert.doesNotMatch(js, /runtime-agent|runtimeAgentSelect/);
  assert.match(js, /agent-run/);
  assert.match(js, /android-build/);
  assert.match(js, /formats:\["apk","aab"\]/);
  assert.match(js, /confirmExecution:true/);
  assert.ok(js.includes('/api/artifacts/'));
  assert.match(js, /URL.createObjectURL/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.match(js, /let runtimeToken=""/);
});

test('cloud worker remains available without an optional persistent runtime', () => {
  assert.match(html, /id="runtime-status">العامل السحابي عند الطلب</);
  assert.match(js, /CLOUD WORKER READY/);
  assert.match(js, /العامل السحابي عند الطلب/);
});

test('PWA metadata uses BLACK VANTA identity', () => {
  assert.match(manifest, /BLACK VANTA/);
  assert.doesNotMatch(manifest, /Phantom/i);
});
