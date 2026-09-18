/**
 * Turns a phone screen recording into the clip the /work phone plays.
 *
 *     npm run app:video -- <slug> <recording> [--from <sec>] [--for <sec>]
 *
 * Writes public/apps/<slug>.mp4, then set `video: "/apps/<slug>.mp4"` on that
 * project in src/content/site.ts.
 *
 * A raw recording is 1080×2400 at 60fps with audio — tens of megabytes for
 * half a minute, and the phone on the page is 240px wide. This brings it to
 * 1170px tall (twice the phone's rendered height, so it stays sharp on a
 * Retina screen), 30fps, no audio, H.264 in yuv420p so every browser plays
 * it, and moves the index to the front so playback starts before the whole
 * file has arrived.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const [slug, input, ...rest] = process.argv.slice(2);

if (!slug || !input) {
  console.error(
    "usage: npm run app:video -- <slug> <recording> [--from <sec>] [--for <sec>]",
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

if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg is not on PATH — winget install Gyan.FFmpeg, then reopen the terminal");
  process.exit(1);
}

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
  "-vf", "scale=-2:1170:flags=lanczos,fps=30",
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
console.log(`\nnow set  video: "/apps/${slug}.mp4"  on "${slug}" in src/content/site.ts`);
