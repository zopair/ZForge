#!/usr/bin/env python3
"""Offline KemeTone Egyptian Arabic synthesis adapter for ZForge."""
import os
import sys

model_dir, text, output_path = sys.argv[1:4]
sys.path.insert(0, model_dir)

import soundfile as sf
import torch
from kokoro import KModel
from kemetone import EgyptianG2P

phonemes = EgyptianG2P()(text)
if not phonemes:
    raise SystemExit("KEMETONE_EMPTY_TEXT: text produced no phonemes")
if len(phonemes) > 510:
    raise SystemExit("KEMETONE_CONTEXT_LIMIT: input exceeds the 510-token context window")

model = KModel(
    repo_id="Rabe3/kemetone",
    config=os.path.join(model_dir, "config.json"),
    model=os.path.join(model_dir, "kemetone.pth"),
).eval()
voice = torch.load(os.path.join(model_dir, "voices", "kemetone.pt"), map_location="cpu")

with torch.inference_mode():
    audio = model(phonemes, voice[len(phonemes) - 1])

sf.write(output_path, audio.detach().cpu().numpy(), 24000)
