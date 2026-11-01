/**
 * Turns a phone screen recording into the clip the /work phone plays.
 *
 *     npm run app:video -- <slug> <recording> [--from <sec>] [--for <sec>] [--bare]
 *
 * Writes public/apps/<slug>.mp4, then set `video: "/apps/<slug>.mp4"` on that
 * project in src/content/site.ts.
 *
 * A raw recording is 1080×2400 at 60fps with audio — tens of megabytes for
 * half a minute, and the phone on the page is 240px wide. This brings it to
 * at most 1170px tall (twice the phone's rendered height, so it stays sharp
 * on a Retina screen) and at most 30fps — never up, since a smaller clip
 * blown up gains bytes and no detail — with no audio, H.264 in yuv420p so
 * every browser plays it, and the index moved to the front so playback
 * starts before the whole file has arrived.
 *
 * --bare is for a recording with no status bar of its own: captured in a
 * browser's device mode, or cropped. Its header would otherwise run under
 * the phone's notch. It grows a status-bar strip above the app from the
 * app's own top edge, cuts off the recording's home indicator (the phone
 * draws one), and widens it by a few edge pixels so it keeps the screen's
 * shape. Set `videoBare: true` on the project too, so the phone draws its
 * clock in that strip.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

/** The phone's screen, height over width: `paddingTop: 216%` in
 *  phone-showcase.tsx. */
const SCREEN_RATIO = 2.16;

const [slug, input, ...rest] = process.argv.slice(2);

if (!slug || !input) {
  console.error(
    "usage: npm run app:video -- <slug> <recording> [--from <sec>] [--for <sec>] [--bare]",
  );
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`slug must be lowercase letters, digits and dashes: ${slug}`);
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`no such file: ${input}`);
  process.exit(1);
}

const flag = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? undefined : rest[i + 1];
};
const from = flag("--from");
const length = flag("--for");
const bare = rest.includes("--bare");

if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg is not on PATH — winget install Gyan.FFmpeg, then reopen the terminal");
  process.exit(1);
}

const probe = spawnSync(
  "ffprobe",
  [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-of", "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
);
const [width, height, rate] = (probe.stdout ?? "").trim().split(",");
const [num, den = "1"] = (rate ?? "").split("/");
const source = {
  w: Number(width),
  h: Number(height),
  fps: Number(num) / Number(den),
};
if (!source.w || !source.h) {
  console.error(`could not read the video size of ${input}`);
  process.exit(1);
}

const even = (n) => Math.round(n / 2) * 2;
const filters = [];
let frame = { w: source.w, h: source.h };

if (bare) {
  // The recording's home indicator — the centre third of the width, in the
  // bottom 2% — is painted out from the pixels around it. Not cut off:
  // cutting drops the app's last controls to the screen's edge, under the
  // phone's own home bar.
  const indicator = {
    x: Math.round(source.w * 0.32),
    y: Math.round(source.h * 0.982),
    w: Math.round(source.w * 0.36),
    h: Math.round(source.h * 0.016),
  };
  // Deep enough that the app's header starts below the notch, which ends 12%
  // of the screen's width down.
  const top = even(source.w / 12);
  const h = source.h + top;
  const w = Math.max(source.w, even(h / SCREEN_RATIO));
  // Even, because pad rounds an odd offset down for yuv420 and leaves a
  // black column on the far side.
  const left = Math.floor((w - source.w) / 4) * 2;
  const right = w - source.w - left;
  filters.push(
    `delogo=x=${indicator.x}:y=${indicator.y}:w=${indicator.w}:h=${indicator.h}`,
    `pad=${w}:${h}:${left}:${top}`,
    // Mirrored, the sides continue whatever the app cut at its edge; smeared
    // they would streak it.
    `fillborders=left=${left}:right=${right}:mode=mirror`,
    // Smeared, the top strip takes the header's colour on every screen the
    // recording passes through.
    `fillborders=top=${top}:mode=smear`,
  );
  frame = { w, h };
}

if (frame.h > 1170) filters.push("scale=-2:1170:flags=lanczos");
if (source.fps > 30) filters.push("fps=30");

const out = `public/apps/${slug}.mp4`;

const args = [
  "-y",
  "-hide_banner",
  "-loglevel", "error",
  "-stats",
  ...(from ? ["-ss", from] : []),
  "-i", input,
  ...(length ? ["-t", length] : []),
  "-an",
  ...(filters.length ? ["-vf", filters.join(",")] : []),
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "27",
  "-pix_fmt", "yuv420p",
  "-profile:v", "high",
  "-level", "4.1",
  "-movflags", "+faststart",
  out,
];

console.log(`${input} → ${out}\n`);
const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

const mb = statSync(out).size / 1_048_576;
console.log(`\n${out}  ${mb.toFixed(1)} MB`);
if (mb > 8) {
  console.log("that is large for a page asset — trim it with --from/--for, or raise -crf");
}
console.log(
  `\nnow set  video: "/apps/${slug}.mp4"${bare ? ", videoBare: true" : ""}  on "${slug}" in src/content/site.ts`,
);
