# App assets

What the phone on /work is made of: an icon per app for its home screen, and
a screen recording per app for when the icon is tapped.

## Icons

- Square PNG, no rounded corners — the mockup applies the tile radius itself,
  so a pre-rounded icon ends up double-rounded. 192px is enough (the tile is
  40px); 512px if you have it.
- Name it after the project slug: `neemafood.png`, `pizza-heist.png`.
- Set `icon: "/apps/<slug>.png"` on that project in `src/content/site.ts`.

Until an icon is set the home screen draws the app's initials on a tinted
tile, which is why a missing logo looks deliberate rather than broken.

## Recordings

- Record the phone's screen as normal, then:

      npm run app:video -- <slug> path/to/recording.mp4

  which writes `<slug>.mp4` here at page size (1170px tall, 30fps, silent,
  H.264). Use `--from <sec>` and `--for <sec>` to keep only the good part; aim
  for 15–40 seconds and a few megabytes.
- Set `video: "/apps/<slug>.mp4"` on that project.

With a recording the phone plays it, muted and looping, over the app's launch
screen. Without one it falls back to the project's screenshots, and with
neither it shows the launch screen and says so.
