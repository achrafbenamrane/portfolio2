"""
Cuts the assistant's 18 voice clips out of one continuous reading.

    python scripts/split-voice-take.py [path-to-recording]

With no argument it takes the newest audio file in Documents/Sound Recordings.

You read the passage in docs/voice-script.md straight through, at a normal
pace. Nothing to count, nothing to time — every line the assistant says is a
sentence inside it.

How it finds them: the whole take is transcribed once with WORD-LEVEL
timestamps, and each scripted line is located as a run of words in that
transcript. Cutting on silence was the obvious approach and it is worse in
every way — it forces unnatural pauses, it splits sentences at their own
commas, and when it mis-segments it does so silently, leaving the assistant
saying a sentence it was never given. Locating words means the audio is cut
where the words actually are.

Requires ffmpeg and GROQ_API_KEY (already in .env.local).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
VOICE = ROOT / "public" / "voice"
SCRIPT = VOICE / "script.json"

TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
TRANSCRIBE_MODEL = "whisper-large-v3-turbo"

#: Keep a little air either side so words are not clipped at the consonant.
PAD_SEC = 0.12

#: Below this the match is treated as absent and reported, not shipped. A
#: wrong clip is worse than a missing one: a missing clip falls back to the
#: browser voice, a wrong one has the assistant say something untrue.
MIN_SIMILARITY = 0.62

#: How far the spoken run may differ in length from the written line, in words.
#: Whisper drops or splits the odd word, so an exact length match is too strict.
WINDOW_SLACK = 4


def main(argv: list[str]) -> int:
    if not SCRIPT.exists():
        print("run `npm run voice:lines` first", file=sys.stderr)
        return 1
    lines = json.loads(SCRIPT.read_text(encoding="utf-8"))["lines"]

    take = Path(argv[1]) if len(argv) > 1 else newest_recording()
    if take is None or not take.exists():
        print("no recording found — pass the path explicitly", file=sys.stderr)
        return 1

    key = groq_key()
    if not key:
        print("GROQ_API_KEY not set (try `vercel env pull`)", file=sys.stderr)
        return 1

    print(f"take: {take.name}  ({duration(take):.0f}s)")
    print("transcribing…")
    words = transcribe_words(take, key)
    if not words:
        return 1
    print(f"  {len(words)} words recognised\n")

    # Longest lines first: they are the most distinctive, so they claim their
    # span before a short line can steal part of it.
    order = sorted(range(len(lines)), key=lambda i: -len(lines[i]["speech"].split()))
    taken: list[tuple[int, int]] = []
    found: dict[str, tuple[float, float, float]] = {}

    for index in order:
        line = lines[index]
        span = locate(line["speech"], words, taken)
        if span is None:
            continue
        start_i, end_i, score = span
        taken.append((start_i, end_i))
        found[line["id"]] = (words[start_i]["start"], words[end_i]["end"], score)

    written, missing = 0, []
    for line in lines:
        hit = found.get(line["id"])
        if hit is None:
            missing.append(line)
            continue
        start, end, score = hit
        cut(take, start, end, VOICE / f"{line['id']}.mp3")
        print(f"  {score:.2f}  {end - start:5.1f}s  {line['id']}")
        written += 1

    print(f"\nwrote {written} of {len(lines)} clips to public/voice/")
    if missing:
        print(f"\n{len(missing)} line(s) not found in the recording:")
        for line in missing:
            print(f"  [{line['id']}] {line['speech']}")
        print("\nRead those again into a second file and re-run — already-written")
        print("clips are left alone unless a better match turns up.")
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
        p for p in folder.glob("*")
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


def transcribe_words(take: Path, key: str) -> list[dict]:
    with take.open("rb") as handle:
        response = requests.post(
            TRANSCRIBE_URL,
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (take.name, handle)},
            data={
                "model": TRANSCRIBE_MODEL,
                "language": "en",
                "response_format": "verbose_json",
                "timestamp_granularities[]": "word",
            },
            timeout=300,
        )
    if response.status_code != 200:
        print(f"transcription failed {response.status_code}: {response.text[:200]}",
              file=sys.stderr)
        return []
    return response.json().get("words", []) or []


def normalise(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def locate(
    speech: str, words: list[dict], taken: list[tuple[int, int]]
) -> tuple[int, int, float] | None:
    """
    Finds the run of transcript words that best matches one written line.

    Slides a window whose length brackets the line's own word count, scores
    each against the line, and keeps the best. Windows overlapping an
    already-claimed run are skipped, so two similar lines cannot both take it.
    """
    target = normalise(speech)
    n = len(target.split())
    if n == 0 or not words:
        return None

    flat = [normalise(w.get("word", "")) for w in words]
    best: tuple[int, int, float] | None = None

    for size in range(max(n - WINDOW_SLACK, 1), n + WINDOW_SLACK + 1):
        for start in range(0, len(words) - size + 1):
            end = start + size - 1
            if any(start <= b and a <= end for a, b in taken):
                continue
            candidate = " ".join(flat[start : end + 1]).strip()
            if not candidate:
                continue
            score = SequenceMatcher(None, target, candidate).ratio()
            if best is None or score > best[2]:
                best = (start, end, score)

    if best is None or best[2] < MIN_SIMILARITY:
        return None
    return best


def cut(take: Path, start: float, end: float, out: Path) -> None:
    """Loudness-normalised so no clip is noticeably louder than its neighbour."""
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-ss", f"{max(start - PAD_SEC, 0):.3f}", "-to", f"{end + PAD_SEC:.3f}",
         "-i", str(take),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1",
         str(out)],
        check=True,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
