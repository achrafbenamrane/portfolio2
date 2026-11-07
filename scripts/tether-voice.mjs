/**
 * Speaks mission control's lines in /3d/2090, in the assistant's voice with its settled settings.
 *
 *     node scripts/tether-voice.mjs
 *
 * Written clean, like the assistant's own clips: the browser adds the robot treatment.
 */

import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

import { forSpeech } from "../src/lib/voice/pronounce.ts";

const VOICE = "en-US-ChristopherNeural";
const PITCH = "-18Hz";
const RATE = "-6%";
const DIR = "public/2090/voice";

const { lines } = JSON.parse(readFileSync("src/content/tether.json", "utf8"));
mkdirSync(DIR, { recursive: true });

for (const line of lines) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const result = tts.toStream(forSpeech(line.say), { pitch: PITCH, rate: RATE });
  const stream = result.audioStream ?? result;
  await new Promise((resolve, reject) => {
    const file = createWriteStream(`${DIR}/${line.id}.mp3`);
    stream.pipe(file);
    file.on("finish", resolve);
    file.on("error", reject);
    stream.on("error", reject);
  });
  console.log(line.id);
}
process.exit(0);
