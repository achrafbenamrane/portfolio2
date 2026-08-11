/**
 * Generates the same line in several masculine neural voices, so the one the
 * assistant uses is chosen by ear rather than by its name.
 *
 *     node scripts/tts-preview.mjs
 *
 * Microsoft's neural voices, reached the way Edge's Read Aloud reaches them:
 * free and with no API key. Pitch is lowered and the rate slowed on every
 * candidate, because "big man" is mostly a low fundamental and an unhurried
 * pace rather than anything the voice model itself provides.
 */

import { createWriteStream, mkdirSync } from "node:fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const LINE = "Hi, I am Achraf. Ask me about my work. Or tell me what to open.";
const OUT = "assets-source/voice-preview";

/** Personality tags are Microsoft's own, from the voice catalogue. */
const CANDIDATES = [
  ["en-US-ChristopherNeural", "-18Hz", "-6%"], // Reliable, Authority
  ["en-US-AndrewNeural", "-15Hz", "-5%"], // Warm, Confident, Authentic
  ["en-US-GuyNeural", "-20Hz", "-6%"], // Passion
  ["en-GB-RyanNeural", "-15Hz", "-5%"], // Friendly, Positive
];

mkdirSync(OUT, { recursive: true });

for (const [voice, pitch, rate] of CANDIDATES) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const short = voice.replace(/Neural$/, "").replace(/^en-(US|GB)-/, "");
  const result = tts.toStream(LINE, { pitch, rate });
  const stream = result.audioStream ?? result;

  await new Promise((resolve, reject) => {
    const file = createWriteStream(`${OUT}/tts-${short}.mp3`);
    stream.pipe(file);
    file.on("finish", resolve);
    file.on("error", reject);
    stream.on("error", reject);
  });

  console.log(`  ${short.padEnd(14)} ${pitch} ${rate}`);
}
