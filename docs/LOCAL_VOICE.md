# Local Voice Runtime

BLACK VANTA can use optional, self-hosted speech engines. Microphone capture happens in the browser; transcription and synthesis run on the machine hosting the ZForge Task Gateway. Audio is not sent to a cloud speech API.

## Engines

- **Speech-to-text:** whisper.cpp CLI (`whisper-cli`) with a locally stored Whisper model.
- **Text-to-speech:** Piper CLI with a locally stored voice model.
- Both are optional and independently configurable. No model or executable is downloaded automatically.

## Host configuration

Build/install whisper.cpp and Piper from their open-source projects on the runtime host. Download model files separately, review each model/voice license and language support, and store them locally.

Set environment variables before starting the runtime:

```sh
ZFORGE_WHISPER_BIN=/usr/local/bin/whisper-cli
ZFORGE_WHISPER_MODEL=/opt/models/ggml-base.bin
ZFORGE_PIPER_BIN=/usr/local/bin/piper
ZFORGE_PIPER_MODEL=/opt/models/ar_JO-voice.onnx
ZFORGE_VOICE_TIMEOUT_MS=120000
```

The Piper model path is an example only: select a voice model that actually exists and supports the desired language. Whisper multilingual models can transcribe multiple languages; accuracy and latency depend on model size and host resources.

## API

- `GET /api/voice/capabilities` — authenticated capability report.
- `POST /api/voice/transcribe` — authenticated raw audio body with an audio MIME type.
- `POST /api/voice/synthesize` — authenticated JSON body `{ "text": "..." }`, returns `audio/wav`.

Accepted input MIME types: WebM, Ogg, WAV, MP4/M4A and MPEG audio. Default maximum input is 25 MiB; output WAV is capped at 50 MiB; text is capped at 8,000 characters; process timeout defaults to 120 seconds. Processes are started directly without a shell. Temporary audio is written with owner-only permissions and deleted after processing.

## BLACK VANTA controls

After connecting to the Task Gateway, enable **الصوت المحلي**. The microphone button records a short clip and places the locally transcribed text in the composer for review before sending. Verified agent replies can be synthesized to a local WAV player when Piper is configured.

The browser requires microphone permission and a secure context (HTTPS or localhost). The PWA itself does not perform transcription or synthesis when the runtime host has not configured the corresponding model and executable.
