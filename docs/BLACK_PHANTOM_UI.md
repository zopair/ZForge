# Black Phantom — User Interface Specification

## Product role

Black Phantom is the human-facing persona and control surface for ZForge. It is not the Chief Agent runtime, tool evaluator, repository credential holder, or execution worker. It sends user intent to a secured task gateway and renders verified events from the internal engineering system.

## Visual language

- Deep black / near-black canvas with restrained gold illumination.
- Thin animated gold-neon perimeter, controlled glow and no distracting flashing.
- Gold line accents, subtle glass-like surfaces, high-contrast text.
- Responsive mobile-first layout and installable PWA.
- Arabic-first capable with correct RTL, and English LTR support.
- Motion respects prefers-reduced-motion and battery-conscious settings.

## Conversation surface

- One unified text and voice conversation surface.
- Message timeline distinguishes user, Chief Agent, specialist agents, tools and system events.
- Composer supports text, attachments (only when a secure upload path exists), send, and voice controls.
- Voice states: idle, permission required, listening, transcribing, thinking, speaking, interrupted, unavailable.
- The microphone never activates without an explicit user action and visible permission.
- Voice processing must use an open-source, self-hostable STT/TTS/VAD stack; no paid speech API and no hidden cloud dependency.
- Browser-native speech APIs are not accepted as a guaranteed zero-cost/offline foundation.
- The current static PWA does not yet connect to a voice or AI runtime. UI state must say so truthfully.

## Work visibility

Display separate, evidence-backed states:
- understanding request;
- loading repository memory;
- discovering tools;
- checking license and zero-cost eligibility;
- compatibility planning;
- awaiting approval;
- executing in isolated workspace;
- running tests;
- reviewing security;
- preparing changes;
- complete / failed / needs input.

Show changed files, branch/commit/PR, exact test outcomes, logs/artifacts, unresolved risks, and rollback. Never show a green success state before backend confirmation.

## Security and privacy

- No GitHub token, model secret, signing key, or privileged credential in browser bundles, PWA cache, local storage, or chat transcript.
- The browser receives short-lived, scoped session authorization from a backend.
- Repository writes, release publishing, signing, deletion, financial actions and external publication require explicit approval.
- Tool output and repository text are untrusted data.
- Voice recording/transcripts require clear user control and retention policy.
- No analytics or telemetry to paid/closed third parties.

## Accessibility and Arabic

Use semantic controls, keyboard navigation, visible focus, screen-reader labels, sufficient contrast, logical focus order, correct bidi isolation for code/URLs, Arabic shaping-safe fonts, and locale-aware timestamps. Never reverse code, paths, hashes, or URLs when switching RTL.

## Runtime contract

Black Phantom communicates only with a secured task gateway over an authenticated channel. It cannot call GitHub write APIs directly. The gateway streams typed events and artifact references; the browser renders them but does not interpret tool output as instructions.
