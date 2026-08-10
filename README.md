# portfolio2

Portfolio for **Benamrane Mohamed Achraf** — Full-Stack Developer, UI/UX &
Graphic Designer, and Network & Information Security Engineer, Annaba, Algeria.

Two things here are not ordinary portfolio furniture:

- **A hand-tracked hero.** A webcam feed drives an on-device hand model; opening
  and closing your hand folds a photograph of me into a paper ball and back.
- **A 3D desktop.** A procedurally modelled monitor whose screen is real DOM.
  Point with your index finger, pinch to click, and open the folders inside it.

Both run entirely on-device. No video ever leaves the machine.

## Running it

```bash
npm install     # postinstall vendors the MediaPipe WASM into public/
npm run dev
```

Hand control needs a secure context — `localhost` counts, production needs
HTTPS.

## Layout

```
src/
  app/                  routes: /, /work, /experience, /certifications, /contact
  components/
    hero/               the portrait → origami morph
    imac/               the 3D monitor, its desktop, dock and folder windows
  content/              ALL copy and data — the only file you edit to change text
  lib/vision/           hand sensor: curl metric, One Euro filter, pointer
  styles/               the desktop's own stylesheet
scripts/
  sync-mediapipe.mjs    vendors the WASM runtime (runs on postinstall)
  prepare-hero-assets.py  cuts the hero images out of their backgrounds
  prepare-icons.py      builds the favicons from the portrait
assets-source/          original, uncut source photographs
```

## Regenerating assets

The images in `public/` are build output, not hand-edited. After replacing
anything in `assets-source/`:

```bash
python scripts/prepare-hero-assets.py   # portrait + origami cut-outs
python scripts/prepare-icons.py         # favicon / apple-icon
```

## Notable implementation details

- **Hand openness is measured from finger curl angles, not fingertip
  distance** — the obvious metric is not scale-invariant, so the value drifts as
  you lean toward the camera.
- **Calibration is adaptive.** Raw curl depends on the hand, the camera and the
  distance, so fixed thresholds are wrong for every visitor but one.
- **60 Hz values never touch React state.** The sensor is a mutable store read
  inside `requestAnimationFrame`; React only subscribes to status changes.
- **The paper fold is a sequence of half-plane creases**, so the sheet stays
  connected and inextensible like real paper instead of scattering.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Three.js + React Three Fiber
· MediaPipe Tasks Vision

## Recording the assistant's voice

The desktop has a voice assistant. It listens with the browser's speech
recognition, matches what it heard against a fixed intent table
(`src/content/voice.ts`), and speaks the reply back.

Replies are **pre-rendered audio**, not live synthesis — no API key, no
per-reply cost, no latency, and it works offline. Until the clips exist the
browser's own robotic voice stands in, so the feature is usable but obviously
unfinished rather than silently broken.

To record them, read `docs/voice-script.md` aloud in one take — it is a
normal paragraph, and every line the assistant says is a sentence inside it.

```bash
npm run voice:lines      # writes public/voice/script.json
# read docs/voice-script.md into one recording
npm run voice:split      # cuts it into public/voice/<id>.mp3
npm run voice:lines      # refresh the manifest the site reads at runtime
```

`voice:split` transcribes the whole take once with WORD-LEVEL timestamps and
locates each written line as a run of words, then cuts the audio there.

Cutting on silence was the obvious approach and is worse in every way: it
forces unnatural pauses between lines, it splits sentences at their own commas
(measured — a 0.55 s threshold produced 27 segments where 20 were expected),
and when it mis-segments it does so *silently*, leaving the assistant saying a
sentence it was never given. Locating words cuts where the words actually are,
and anything not found is reported rather than shipped — a missing clip falls
back to the browser voice, a wrong one has the assistant say something untrue.

Two rules the script enforces or depends on:

- **No line may interpolate a value.** A clip that says "19 projects" becomes
  wrong the day a twentieth ships. `npm run voice:lines` fails if it finds one.
- **Re-record a line when its wording changes.** `script.json` carries a hash
  of each line's text so drift is visible rather than silent.

Speech recognition is Chrome, Edge and Safari only — Firefox does not ship it.
Unlike the hand tracking, it is **not** on-device: the browser streams audio to
its own service to transcribe. The UI says so.

### Open-ended questions

Beyond the fixed commands, the assistant answers free-form questions about
Achraf and the site via `POST /api/ask` (Claude Haiku through the Vercel AI
Gateway).

The deterministic intent table runs **first**, on the client. Commands and the
common questions never reach the model at all, so the endpoint is only paid for
genuinely novel questions.

Grounding is the whole of `src/content/site.ts`, serialised into the
instructions — no vector store, no embeddings, no retrieval. The corpus is a
few thousand tokens, so it fits outright, and that removes a class of failure:
the assistant cannot answer from a stale index because there is no index.

The endpoint is public, so it ships with guards rather than hardening added
later: same-origin check, per-IP rate limit (8/min, 40/hour), a 300-character
input cap, a 200-token output cap, and an answer cache for repeated questions.

**Provider:** Groq when `GROQ_API_KEY` is set, otherwise Vercel's AI Gateway.
Groq is the default because its free tier serves this outright, where the
Gateway refuses every request until a payment method is on file
(`customer_verification_required`). `GROQ_MODEL` overrides the model, since
Groq retires ids periodically and that should be a dashboard change rather than
a code change.

```bash
vercel env add GROQ_API_KEY     # paste the key at the prompt, select all envs
vercel deploy --prod            # env changes need a fresh deployment
vercel env pull                 # to run it locally
```

Get a free key at https://console.groq.com/keys.
