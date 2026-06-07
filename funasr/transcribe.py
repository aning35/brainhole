#!/usr/bin/env python3
"""
FunASR Audio Transcription Script for Brainhole.

Usage:
    python transcribe.py <audio_file_path> [--model paraformer-zh] [--output json]

Outputs JSON to stdout with the transcription result.
"""

import sys
import json
import os
import time
import argparse
from pathlib import Path

# Use HuggingFace mirror for China (if not already set)
if not os.environ.get('HF_ENDPOINT'):
    os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'


def format_timestamp(ms: int) -> str:
    """Convert milliseconds to HH:MM:SS format."""
    seconds = ms // 1000
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def get_audio_duration(file_path: str) -> float:
    """Get audio duration in seconds using pydub."""
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(file_path)
        return len(audio) / 1000.0
    except Exception:
        return 0.0


def transcribe(audio_path: str, model_name: str = "paraformer-zh") -> dict:
    """Transcribe an audio file using FunASR."""
    from funasr import AutoModel

    print(json.dumps({"type": "log", "message": "正在加载 FunASR 模型..."}), flush=True)

    # Initialize model (will auto-download on first use, ~220MB)
    model = AutoModel(
        model=model_name,
        vad_model="fsmn-vad",       # Voice Activity Detection for splitting long audio
        punc_model="ct-punc",        # Punctuation restoration
        spk_model=None,              # No speaker diarization for now
    )

    print(json.dumps({"type": "log", "message": f"开始转录: {Path(audio_path).name}"}), flush=True)

    start_time = time.time()

    # Run transcription
    result = model.generate(
        input=audio_path,
        batch_size_s=300,   # Process in 300-second batches for memory efficiency
    )

    elapsed = time.time() - start_time

    # Get audio duration
    duration = get_audio_duration(audio_path)

    # Extract text and timestamps
    segments = []
    full_text = ""

    if result and len(result) > 0:
        for item in result:
            text = item.get("text", "")
            full_text += text

            # Check if timestamp info is available
            timestamp = item.get("timestamp", None)
            if timestamp and len(timestamp) > 0:
                # timestamp is a list of [start_ms, end_ms] pairs per character/word
                seg_start = timestamp[0][0] if timestamp else 0
                seg_end = timestamp[-1][1] if timestamp else 0
                segments.append({
                    "start": seg_start,
                    "end": seg_end,
                    "text": text,
                })
            else:
                segments.append({
                    "start": 0,
                    "end": int(duration * 1000),
                    "text": text,
                })

    print(json.dumps({"type": "log", "message": f"转录完成，耗时 {elapsed:.1f}s"}), flush=True)

    return {
        "type": "result",
        "text": full_text,
        "segments": segments,
        "duration": duration,
        "elapsed": round(elapsed, 1),
        "model": model_name,
        "file": Path(audio_path).name,
    }


def main():
    parser = argparse.ArgumentParser(description="FunASR Audio Transcription")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--model", default="paraformer-zh", help="FunASR model name")
    args = parser.parse_args()

    audio_path = args.audio_path
    if not os.path.exists(audio_path):
        print(json.dumps({
            "type": "error",
            "message": f"文件不存在: {audio_path}"
        }))
        sys.exit(1)

    try:
        result = transcribe(audio_path, args.model)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": f"转录失败: {str(e)}"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
