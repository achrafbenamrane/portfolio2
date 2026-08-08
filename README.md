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
