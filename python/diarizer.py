#!/usr/bin/env python3
"""
BriefOS speaker diarization.

Run as a subprocess from Node (child_process.spawn — never inline). Emits a
JSON array of speaker turns to STDOUT and nothing else, so the Node side can
JSON.parse(stdout) directly. All diagnostics go to STDERR.

Usage:
    python diarizer.py <audio_path> <hf_token> [num_speakers]

Output (stdout):
    [{"speaker": "SPEAKER_00", "start_ms": 0, "end_ms": 4200}, ...]

Contract matches DiarSegment in src/transcription/TranscriptMerger.ts.
On failure: prints error to stderr and exits non-zero so the pipeline falls
back to a single "Speaker" without losing the meeting.
"""

import sys
import json


def log(*args):
    """Diagnostics to stderr — keeps stdout pure JSON for the Node parser."""
    print("[diarizer]", *args, file=sys.stderr, flush=True)


def diarize(audio_path, hf_token, num_speakers=None):
    # Imported lazily so a missing dependency produces a clean error message
    # instead of a crash before we can report it.
    import torch
    from pyannote.audio import Pipeline

    log("loading pyannote/speaker-diarization-3.1")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token,
    )

    if torch.cuda.is_available():
        log("CUDA available — using GPU")
        pipeline = pipeline.to(torch.device("cuda"))
    else:
        log("running on CPU")

    params = {}
    if num_speakers:
        params["num_speakers"] = num_speakers

    log("diarizing", audio_path)
    diarization = pipeline(audio_path, **params)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append(
            {
                "speaker": speaker,  # "SPEAKER_00", "SPEAKER_01", ...
                "start_ms": int(turn.start * 1000),
                "end_ms": int(turn.end * 1000),
            }
        )

    log(f"produced {len(segments)} segments")
    return segments


def main():
    if len(sys.argv) < 3:
        log("usage: diarizer.py <audio_path> <hf_token> [num_speakers]")
        sys.exit(2)

    audio_path = sys.argv[1]
    hf_token = sys.argv[2]
    num_speakers = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None

    try:
        segments = diarize(audio_path, hf_token, num_speakers)
    except Exception as exc:  # noqa: BLE001 — report anything, let Node fall back
        log("ERROR:", repr(exc))
        sys.exit(1)

    # The ONLY thing written to stdout — the Node side parses exactly this.
    json.dump(segments, sys.stdout)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
