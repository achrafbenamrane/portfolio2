/**
 * Generates the assistant's stored answer clips.
 *
 *     npm run voice:generate
 *
 * These are the fast path: the lines the assistant says most often, served as
 * static files so a command answers instantly instead of waiting on a request.
 * Anything unanticipated is synthesised at runtime through /api/speak, in the
 * same voice with the same settings.
 *
 * They are written CLEAN — no robot treatment baked in. The browser applies it
 * to these and to generated speech with one shared function, which is what
 * makes a stored reply and a generated one sound like the same machine. Baking
 * it here would leave two chains to keep in step, and they would drift.
 */

import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const VOICE = process.env.TTS_VOICE ?? "en-US-ChristopherNeural";
const PITCH = "-18Hz";
const RATE = "-6%";

const DIR = "public/voice";
const script = JSON.parse(readFileSync(`${DIR}/script.json`, "utf8"));

mkdirSync(DIR, { recursive: true });
console.log(`voice: ${VOICE}  pitch ${PITCH}  rate ${RATE}\n`);

const written = [];
for (const line of script.lines) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const result = tts.toStream(line.speech, { pitch: PITCH, rate: RATE });
  const stream = result.audioStream ?? result;

  await new Promise((resolve, reject) => {
    const file = createWriteStream(`${DIR}/${line.id}.mp3`);
    stream.pipe(file);
    file.on("finish", resolve);
    file.on("error", reject);
    stream.on("error", reject);
  });

  written.push(line.id);
  console.log(`  ${line.id}`);
}

writeFileSync(
  `${DIR}/manifest.json`,
  `${JSON.stringify({ lines: written }, null, 2)}\n`,
);
console.log(`\n${written.length} clips written, manifest updated`);
