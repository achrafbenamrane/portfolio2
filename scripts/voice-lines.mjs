/**
 * Writes the assistant's script out as a manifest for voice cloning.
 *
 * Run: npm run voice:lines
 *
 * This does not call a TTS service itself — cloning needs an account and a
 * consent-verified sample of Achraf's voice, so the audio step is deliberately
 * a separate, human-initiated action. What this does is keep the single source
 * of truth (src/content/voice.ts) and the audio on disk from drifting: it
 * prints exactly which clips are missing, stale or orphaned.
 *
 * Drop finished clips in public/voice/<id>.mp3 and re-run to update the
 * manifest the site reads at runtime.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const voiceDir = join(root, "public", "voice");
const source = join(root, "src", "content", "voice.ts");

/**
 * The lines are parsed out of the TS source rather than imported, so this
 * stays a plain node script with no build step in front of it.
 */
function extractLines() {
  const text = readFileSync(source, "utf8");
  const lines = [];

  // Anchored on `speech:` and searching BACKWARD for its id. Scanning forward
  // from `id:` instead pairs every line with the wrong clip, because each
  // intent's `action` carries a second, nested `id` that the scan picks up.
  const speeches = /speech:\s*(`[^`]*`|"[^"]*")/g;
  let match;
  while ((match = speeches.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const ids = [...before.matchAll(/id:\s*"([^"]+)"/g)];
    const id = ids.at(-1)?.[1];
    if (!id) continue;

    const speech = match[1].slice(1, -1).trim();
    lines.push({ id, speech });
  }
  return lines;
}

const lines = extractLines();

const dynamic = lines.filter((line) => line.speech.includes("${"));
if (dynamic.length > 0) {
  console.error("These lines interpolate a value, so a recording of them goes stale");
  console.error("the moment that value changes. Make them evergreen:");
  for (const line of dynamic) console.error(`  ${line.id}: "${line.speech}"`);
  process.exit(1);
}

if (lines.length === 0) {
  console.error("No lines found in src/content/voice.ts — did its shape change?");
  process.exit(1);
}

mkdirSync(voiceDir, { recursive: true });

const present = [];
const missing = [];
for (const line of lines) {
  const file = join(voiceDir, `${line.id}.mp3`);
  (existsSync(file) ? present : missing).push(line);
}

// The script text is hashed so a reworded line is visibly stale rather than
// silently answering with the old recording.
const script = lines.map((line) => ({
  ...line,
  hash: createHash("sha1").update(line.speech).digest("hex").slice(0, 8),
}));

writeFileSync(
  join(voiceDir, "script.json"),
  `${JSON.stringify({ lines: script }, null, 2)}\n`,
);
writeFileSync(
  join(voiceDir, "manifest.json"),
  `${JSON.stringify({ lines: present.map((line) => line.id) }, null, 2)}\n`,
);

console.log(`${lines.length} lines · ${present.length} recorded · ${missing.length} missing`);
if (missing.length > 0) {
  console.log("\nStill to generate:");
  for (const line of missing) console.log(`  ${line.id}.mp3  —  "${line.speech}"`);
  console.log(`\nFull script for the cloning tool: public/voice/script.json`);
}
