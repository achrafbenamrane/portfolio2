# App assets

What the phones on /work are made of — one phone per app: an icon for its
launch screen and its name under the phone, and a screen recording for the
phone to play.

## Icons

- Square PNG, no rounded corners — the mockup applies the tile radius itself,
  so a pre-rounded icon ends up double-rounded. 192px is enough (the largest tile
  is 64px); 512px if you have it.
- Name it after the project slug: `neemafood.png`, `pizza-heist.png`.
- Set `icon: "/apps/<slug>.png"` on that project in `src/content/site.ts`.

Until an icon is set the phone draws the app's initials on a tinted
tile, which is why a missing logo looks deliberate rather than broken.

## Brand colour

- Every app gets one: `brand: "#RRGGBB"` on its project. Its badges (the
  tags under its description) are drawn in it.
- Sample it from the icon — the dominant colour that is not white or black.
  When the icon is mostly black or white, take it from the app's own screens
  instead, as La Casa da Pizza's red comes from its header.
- Any colour works: the badge darkens its lettering by itself until it is
  legible on the page.

## Recordings

- Record the phone's screen as normal, then:

      npm run app:video -- <slug> path/to/recording.mp4

  which writes `<slug>.mp4` here at page size (at most 1170px tall and 30fps,
  silent, H.264). Use `--from <sec>` and `--for <sec>` to keep only the good
  part; aim for 15–40 seconds and a few megabytes.
- Set `video: "/apps/<slug>.mp4"` on that project.
- A recording with no status bar (made in a browser's device mode, or
  cropped) runs its header under the notch. Add `--bare`: it grows a strip of
  the app's own colour above it and trims its home indicator. Then also set
  `videoBare: true`, so the phone draws its clock in that strip.

With a recording the phone plays it, muted and looping, over the app's launch
screen. Without one it falls back to the project's screenshots, and with
neither it shows the launch screen and says so.
