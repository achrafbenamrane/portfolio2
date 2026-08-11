import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Speech for an answer that has no stored clip.
 *
 * Returns plain MP3. The robot treatment is deliberately NOT applied here: the
 * browser runs it on both this audio and the stored clips, using one shared
 * function, which is what guarantees a generated reply and a stored one sound
 * like the same machine rather than merely similar.
 *
 * Microsoft's neural voices, reached the way Edge's Read Aloud reaches them —
 * free, no API key, no account. Pitch is lowered and the rate slowed because
 * "big" is mostly a low fundamental and an unhurried pace.
 */

const VOICE = process.env.TTS_VOICE ?? "en-US-ChristopherNeural";
const PITCH = "-18Hz";
const RATE = "-6%";

const MAX_CHARS = 400;

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimit(ip: string) {
  const now = Date.now();
  const times = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);
  hits.set(ip, times);
  if (hits.size > 5_000) {
    for (const [key, value] of hits) {
      if (value.every((t) => now - t > WINDOW_MS)) hits.delete(key);
    }
  }
  return times.length <= MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof text !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (trimmed.length < 2) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const result = tts.toStream(trimmed, { pitch: PITCH, rate: RATE });
    const stream = result.audioStream ?? result;

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });

    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error("empty audio");

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        // Same words give the same audio, so let the CDN keep it.
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error("speak route failed:", error);
    return Response.json({ error: "Speech unavailable" }, { status: 502 });
  }
}
