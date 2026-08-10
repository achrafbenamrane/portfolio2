"""
Turns one continuous recording into the assistant's 18 voice clips.

    python scripts/split-voice-take.py [path-to-recording]

With no argument it takes the newest audio file in Documents/Sound Recordings.

Why it transcribes rather than just counting gaps: a real take is never clean.
Lines get fluffed and repeated, a cough lands in a pause, a sentence gets split
by a breath. Splitting on silence and mapping segments to lines in order breaks
on all three, and breaks *silently* — you end up with the assistant confidently
saying the wrong sentence.

So each segment is transcribed (Groq Whisper, free) and matched to the script
by text similarity. Retakes sort themselves out, because the better-matching
take wins. Anything that matches nothing is reported instead of shipped.

Requires ffmpeg and GROQ_API_KEY (already in .env.local).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
VOICE = ROOT / "public" / "voice"
SCRIPT = VOICE / "script.json"

#: Anything quieter than this for this long counts as a gap between lines.
#:
#: 1.1 s, not the 0.55 s this started at. Testing against a synthetic take
#: showed 0.55 s splitting single lines in half at their own commas and full
#: stops — "Yes, I'm available right now. The fastest way to reach me is
#: email" became two segments. The reader is asked for a 2 s gap between
#: lines, so 1.1 s sits clear of both intra-sentence pauses and that gap.
SILENCE_DB = -35
SILENCE_SEC = 1.1

#: Keep a little air either side so words are not clipped at the consonant.
PAD_SEC = 0.18

#: Below this, a segment is assumed to be noise rather than a line.
MIN_SEGMENT_SEC = 0.5
MIN_SIMILARITY = 0.55

TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
TRANSCRIBE_MODEL = "whisper-large-v3-turbo"

#: Groq's free tier rate-limits Whisper, and a 20-segment take hits it. Pacing
#: the calls costs a minute and avoids losing segments to 429s.
TRANSCRIBE_GAP_SEC = 3.0
TRANSCRIBE_RETRIES = 4


def main(argv: list[str]) -> int:
    if not SCRIPT.exists():
        print("run `npm run voice:lines` first", file=sys.stderr)
        return 1
    lines = json.loads(SCRIPT.read_text(encoding="utf-8"))["lines"]

    take = Path(argv[1]) if len(argv) > 1 else newest_recording()
    if take is None or not take.exists():
        print("no recording found — pass the path explicitly", file=sys.stderr)
        return 1
    print(f"take: {take.name}")

    key = groq_key()
    if not key:
        print("GROQ_API_KEY not set (try `vercel env pull`)", file=sys.stderr)
        return 1

    work = ROOT / ".voice-work"
    work.mkdir(exist_ok=True)

    spans = detect_spans(take)
    print(f"found {len(spans)} spoken segments (script has {len(lines)} lines)")
    if not spans:
        return 1

    # Transcribe every segment, then let similarity decide what is what.
    best: dict[str, tuple[float, Path, str]] = {}
    for index, (start, end) in enumerate(spans):
        clip = work / f"seg{index:03d}.wav"
        extract(take, start, end, clip)
        heard = transcribe(clip, key)
        if not heard:
            continue

        line_id, score = best_match(heard, lines)
        flag = " " if score >= MIN_SIMILARITY else "?"
        print(f"  {flag} {index:>2}  {end - start:5.1f}s  {score:.2f}  {line_id:<14} {heard[:56]}")

        if score >= MIN_SIMILARITY and (
            line_id not in best or score > best[line_id][0]
        ):
            best[line_id] = (score, clip, heard)

    print()
    written, missing = 0, []
    for line in lines:
        entry = best.get(line["id"])
        if entry is None:
            missing.append(line)
            continue
        export(entry[1], VOICE / f"{line['id']}.mp3")
        written += 1

    print(f"wrote {written} clips to public/voice/")
    if missing:
        print(f"\n{len(missing)} line(s) not matched — re-record just these:")
        for line in missing:
            print(f"  [{line['id']}] {line['speech']}")

    return 0


def groq_key() -> str | None:
    if os.environ.get("GROQ_API_KEY"):
        return os.environ["GROQ_API_KEY"]
    env = ROOT / ".env.local"
    if env.exists():
        for row in env.read_text(encoding="utf-8").splitlines():
            if row.startswith("GROQ_API_KEY="):
                return row.split("=", 1)[1].strip().strip('"')
    return None


def newest_recording() -> Path | None:
    folder = Path.home() / "Documents" / "Sound Recordings"
    if not folder.exists():
        folder = Path.home() / "Documents"
    audio = [
        p
        for p in folder.glob("*")
        if p.suffix.lower() in {".m4a", ".mp3", ".wav", ".wma", ".flac", ".ogg"}
    ]
    return max(audio, key=lambda p: p.stat().st_mtime) if audio else None


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def detect_spans(take: Path) -> list[tuple[float, float]]:
    """Inverts ffmpeg's silence list into the spans that contain speech."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(take),
         "-af", f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_SEC}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    log = proc.stderr

    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", log)]
    total = duration(take)

    # Speech runs from the end of each silence to the start of the next.
    boundaries: list[tuple[float, float]] = []
    cursor = 0.0
    for index, start in enumerate(starts):
        if start > cursor:
            boundaries.append((cursor, start))
        cursor = ends[index] if index < len(ends) else total
    if cursor < total:
        boundaries.append((cursor, total))

    return [
        (max(a - PAD_SEC, 0), min(b + PAD_SEC, total))
        for a, b in boundaries
        if b - a >= MIN_SEGMENT_SEC
    ]


def extract(take: Path, start: float, end: float, out: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(take),
         "-ac", "1", "-ar", "16000", str(out)],
        check=True,
    )


def transcribe(clip: Path, key: str) -> str:
    """Retries on 429 rather than dropping the segment — a lost transcript
    means a line silently missing from the finished assistant."""
    for attempt in range(TRANSCRIBE_RETRIES):
        with clip.open("rb") as handle:
            response = requests.post(
                TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {key}"},
                files={"file": (clip.name, handle, "audio/wav")},
                data={"model": TRANSCRIBE_MODEL, "language": "en",
                      "response_format": "json"},
                timeout=120,
            )
        if response.status_code == 200:
            time.sleep(TRANSCRIBE_GAP_SEC)
            return response.json().get("text", "").strip()

        if response.status_code == 429:
            wait = float(response.headers.get("retry-after", 0)) or (
                TRANSCRIBE_GAP_SEC * (attempt + 2)
            )
            print(f"    rate limited, waiting {wait:.0f}s…")
            time.sleep(wait)
            continue

        print(f"    transcribe failed {response.status_code}: {response.text[:120]}")
        return ""

    print("    giving up on this segment after repeated rate limits")
    return ""


def normalise(text: str) -> str:
    """Punctuation-free lowercase, so an em dash in the script does not count
    against a transcript that never had one."""
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def best_match(heard: str, lines: list[dict]) -> tuple[str, float]:
    target = normalise(heard)
    scored = [
        (SequenceMatcher(None, target, normalise(line["speech"])).ratio(), line["id"])
        for line in lines
    ]
    score, line_id = max(scored)
    return line_id, score


def export(clip: Path, out: Path) -> None:
    """Loudness-normalised so no clip is noticeably louder than its neighbour."""
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(clip),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1",
         str(out)],
        check=True,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
