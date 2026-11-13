# Local Voice Runtime

BLACK VANTA can use optional, self-hosted speech engines. Microphone capture happens in the browser; transcription and synthesis run on the machine hosting the ZForge Task Gateway. Audio is not sent to a cloud speech API.

## Engines

- **Speech-to-text:** whisper.cpp CLI (`whisper-cli`) with a locally stored multilingual Whisper model.
- **Audio normalization:** FFmpeg converts browser WebM/Ogg/MP4/MP3 clips to 16 kHz mono WAV before Whisper. Existing WAV input does not require conversion.
- **Text-to-speech:** Piper CLI with a locally stored voice model.
- Both are optional and independently configurable. No model or executable is downloaded automatically.

## Host configuration

Build/install whisper.cpp and Piper from their open-source projects on the runtime host. Download model files separately, review each model/voice license and language support, and store them locally.

Install the free local executables on the runtime host and set environment variables before starting the runtime:

```sh
ZFORGE_WHISPER_BIN=/usr/local/bin/whisper-cli
ZFORGE_WHISPER_MODEL=/opt/models/ggml-small.bin
ZFORGE_FFMPEG_BIN=/usr/bin/ffmpeg
ZFORGE_PIPER_BIN=/usr/bin/python3
ZFORGE_PIPER_MODEL=/opt/models/ar_JO-kareem-medium.onnx
ZFORGE_VOICE_TIMEOUT_MS=120000
```

The Arabic Piper voice catalog includes `ar_JO-kareem` in low and medium quality. It is Jordanian Arabic, not an Egyptian-accent voice. Download the `.onnx` model, its matching `.onnx.json` configuration, and inspect the voice's `MODEL_CARD` before use; voice model licenses can differ. The official Whisper.cpp model catalog provides multilingual models such as `tiny`, `base`, `small`, `medium` and `large-v3`; select a model without the `.en` suffix for Arabic. Larger models generally require more disk, memory and compute. Actual Egyptian-dialect recognition quality and speech naturalness must be tested on the target host.


## Reproducible free setup (Linux example)

Build whisper.cpp from its maintained source and download a multilingual model:

```sh
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build --config Release -j
./models/download-ggml-model.sh small
```

Install FFmpeg from the host distribution's free package repository. Install Piper from the maintained Open Home Foundation project and download the Jordanian Arabic voice plus its configuration:

```sh
python3 -m pip install --user piper-tts
python3 -m piper.download_voices ar_JO-kareem-medium --data-dir /opt/models
```

Set `ZFORGE_WHISPER_BIN` to the built `whisper-cli`, `ZFORGE_WHISPER_MODEL` to `models/ggml-small.bin`, `ZFORGE_FFMPEG_BIN` to the host FFmpeg executable, `ZFORGE_PIPER_BIN` to the Python interpreter used for the Piper installation (for example `/usr/bin/python3`), and `ZFORGE_PIPER_MODEL` to `/opt/models/ar_JO-kareem-medium.onnx`. Keep the matching `.onnx.json` file beside the model. Verify the actual paths on the host before starting ZForge.

The Piper adapter invokes the maintained CLI as `python -m piper -m MODEL -f OUTPUT.wav -- TEXT`; text is passed as a distinct process argument, never interpolated into a shell command. The Piper engine repository is GPL-3.0; inspect its distribution obligations and the separate voice `MODEL_CARD` before redistributing either engine or model.

## API

- `GET /api/voice/capabilities` — authenticated capability report.
- `POST /api/voice/transcribe` — authenticated raw audio body with an audio MIME type.
- `POST /api/voice/synthesize` — authenticated JSON body `{ "text": "..." }`, returns `audio/wav`.

Accepted input MIME types: WebM, Ogg, WAV, MP4/M4A and MPEG audio. Default maximum input is 25 MiB; output WAV is capped at 50 MiB; text is capped at 8,000 characters; process timeout defaults to 120 seconds. Processes are started directly without a shell. Temporary audio is written with owner-only permissions and deleted after processing.

## BLACK VANTA controls

After connecting to the Task Gateway, enable **الصوت المحلي**. The microphone button records a short clip and places the locally transcribed text in the composer for review before sending. Verified agent replies can be synthesized to a local WAV player when Piper is configured.

The browser requires microphone permission and a secure context (HTTPS or localhost). WebM/Ogg/MP4/MP3 microphone recordings require FFmpeg on the runtime host; WAV input is passed directly to Whisper.cpp. The PWA itself does not perform transcription or synthesis when the runtime host has not configured the corresponding model and executable.
