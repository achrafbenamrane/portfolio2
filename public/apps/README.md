# App icons

Square PNGs for the phone home screen on /work.

- 512x512, transparent or solid background, no rounded corners — the mockup
  applies the squircle mask itself, so a pre-rounded icon ends up double-rounded.
- Name them after the project slug: `neemafood.png`, `desktop-ids.png`.
- Then set `icon: "/apps/<slug>.png"` on that project in `src/content/site.ts`.

Until an icon is set the home screen draws the app's initials on a tinted
tile, which is why a missing logo looks deliberate rather than broken.
