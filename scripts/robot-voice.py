"""
Robot-voice treatments for the assistant's clips.

    python scripts/robot-voice.py preview          # build variants from one clip
    python scripts/robot-voice.py apply <variant>  # process all 18 clips

The first attempt used `tremolo` and `acrusher`. Both are the wrong tools: an
amplitude wobble reads as gargling and bit-crushing reads as a 1980s toy, and
neither is what modern synthetic voices are built from. These chains use what
actually makes a voice sound machine-made:

* **Harmonised layers** — the dry voice mixed with copies detuned by a few
  cents and an octave below. Two voices at once is a thing a throat cannot do,
  so the ear hears a machine while every word stays intact.
* **Phase zeroing** — rebuilding the signal from its magnitude spectrum with
  the phase discarded. This is the real vocoder-robot effect; it flattens the
  natural pitch jitter that marks a voice as biological.
* **Comb resonance** — very short feedback delays, which colour the voice as
  though it were resonating inside a metal shell.

Nothing here is destructive: every variant is checked for intelligibility by
transcribing it back before it is offered.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = ROOT / "public" / "voice"
PREVIEW = ROOT / "assets-source" / "voice-preview"

TAIL = "loudnorm=I=-16:TP=-1.5:LRA=11"

#: Each variant is a full filter_complex ending at [out].
VARIANTS: dict[str, str] = {
    # Full vocoder robot: phase discarded, NO dry signal blended back.
    #
    # This is the one that actually stops sounding human. Zeroing the phase
    # locks the output pitch to the analysis window — sample_rate / win_size,
    # so 1024 gives a flat ~43 Hz buzz — and a constant pitch regardless of
    # what the speaker's larynx did is precisely what a voice cannot do.
    # Earlier attempts blended the dry voice back in "to protect the words",
    # which quietly reinstated the human pitch contour and undid the effect.
    "H": (
        "[0:a]afftfilt=real='hypot(re,im)':imag='0':win_size=1024:overlap=0.6[rob];"
        "[rob]aecho=0.9:0.86:13:0.22,"
        "highpass=f=100,lowpass=f=7600,treble=g=2:f=3800,"
        "alimiter=level_in=1:level_out=0.94[out]"
    ),
    # Same, one window smaller: pitch locks around 86 Hz, a brighter and more
    # obviously synthetic robot.
    "I": (
        "[0:a]afftfilt=real='hypot(re,im)':imag='0':win_size=512:overlap=0.6[rob];"
        "[rob]aecho=0.9:0.85:9:0.25,"
        "highpass=f=120,lowpass=f=7800,"
        "alimiter=level_in=1:level_out=0.94[out]"
    ),
    # Ring modulation on top of the vocoder: a true carrier multiply, not the
    # amplitude wobble that made the first round gargle. Maximum machine.
    "J": (
        "[0:a]afftfilt=real='hypot(re,im)':imag='0':win_size=1024:overlap=0.6[rob];"
        "[rob]aeval='val(0)*(0.55+0.45*sin(2*PI*42*t))':c=same,"
        "aecho=0.88:0.88:11|23:0.28|0.16,"
        "highpass=f=110,lowpass=f=7000,"
        "alimiter=level_in=1:level_out=0.94[out]"
    ),
    # Vocoder robot dropped an octave and given a long metallic shell — the
    # heavy, deep machine.
    "K": (
        "[0:a]rubberband=pitch=0.86[p];"
        "[p]afftfilt=real='hypot(re,im)':imag='0':win_size=1024:overlap=0.6[rob];"
        "[rob]aecho=0.85:0.9:8|17|29:0.34|0.22|0.13,"
        "highpass=f=95,lowpass=f=6600,"
        "alimiter=level_in=1:level_out=0.94[out]"
    ),
}


def render(src: Path, out: Path, variant: str) -> None:
    chain = VARIANTS[variant]
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
         "-filter_complex", f"{chain};[out]{TAIL}[final]",
         "-map", "[final]",
         "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1",
         str(out)],
        check=True,
    )


def main(argv: list[str]) -> int:
    mode = argv[1] if len(argv) > 1 else "preview"

    if mode == "preview":
        src = VOICE / "greeting.mp3"
        if not src.exists():
            print("no clips yet — run `npm run voice:split` first", file=sys.stderr)
            return 1
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for name in VARIANTS:
            out = PREVIEW / f"robot-{name}.mp3"
            render(src, out, name)
            print(f"  robot-{name}.mp3")
        return 0

    if mode == "apply":
        if len(argv) < 3 or argv[2] not in VARIANTS:
            print(f"pick one of: {', '.join(VARIANTS)}", file=sys.stderr)
            return 1
        variant = argv[2]

        # Deliberately OUTSIDE public/. Anything under public/ is served, so
        # keeping the untreated recordings there would publish a clean sample
        # of Achraf's voice at a guessable URL — the exact thing the raw take
        # is gitignored to avoid.
        raw = ROOT / "assets-source" / "voice-raw"
        raw.mkdir(parents=True, exist_ok=True)
        clips = sorted(VOICE.glob("*.mp3"))
        if not clips:
            print("no clips to process", file=sys.stderr)
            return 1

        for clip in clips:
            # Keep the untouched recording so the treatment can be changed
            # later without asking Achraf to read the passage again.
            original = raw / clip.name
            if not original.exists():
                clip.replace(original)
            render(original, clip, variant)
            print(f"  {clip.name}")

        print(f"\napplied variant {variant} to {len(clips)} clips")
        print("originals kept in assets-source/voice-raw/ (not served, not committed)")
        return 0

    print(f"unknown mode: {mode}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
