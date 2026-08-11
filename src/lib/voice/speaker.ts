import { robotise } from "./robot-dsp";

/**
 * Playback for the assistant's replies.
 *
 * Everything the assistant says goes through the same path: fetch audio,
 * decode it, run the robot treatment over the samples, play the result. A
 * stored answer and one generated for an unanticipated question therefore
 * sound like the same machine by construction, rather than by two chains being
 * kept in step by hand.
 *
 * The treatment runs here rather than at build time for exactly that reason —
 * generated speech cannot be processed ahead of time, so if the stored clips
 * were baked the two would drift apart.
 */

const MANIFEST_URL = "/voice/manifest.json";

let manifest: Set<string> | null = null;
let manifestPromise: Promise<Set<string>> | null = null;

export async function loadManifest(): Promise<Set<string>> {
  if (manifest) return manifest;
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => (response.ok ? response.json() : { lines: [] }))
      .then((data: { lines?: string[] }) => new Set(data.lines ?? []))
      .catch(() => new Set<string>())
      .then((set) => {
        manifest = set;
        return set;
      });
  }
  return manifestPromise;
}

export function hasClonedVoice() {
  return (manifest?.size ?? 0) > 0;
}

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

/** Processed audio, keyed by clip id or by the text that generated it. */
const cache = new Map<string, AudioBuffer>();

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

export function stopSpeaking() {
  if (playing) {
    try {
      playing.stop();
    } catch {
      // Already finished; nothing to stop.
    }
    playing = null;
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

async function processed(
  key: string,
  fetchAudio: () => Promise<ArrayBuffer>,
): Promise<AudioBuffer | null> {
  const cached = cache.get(key);
  if (cached) return cached;

  const ctx = audioContext();
  if (!ctx) return null;

  const decoded = await ctx.decodeAudioData(await fetchAudio());
  const samples = decoded.getChannelData(0);
  const treated = robotise(samples, decoded.sampleRate);

  const buffer = ctx.createBuffer(1, treated.length, decoded.sampleRate);
  // copyToChannel wants a Float32Array over a plain ArrayBuffer; the one from
  // robotise is typed as ArrayBufferLike, which TS will not narrow.
  buffer.copyToChannel(new Float32Array(treated), 0);

  if (cache.size > 40) cache.clear();
  cache.set(key, buffer);
  return buffer;
}

function play(buffer: AudioBuffer): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return Promise.resolve();

  // Browsers start the context suspended until a gesture; the mic tap counts.
  if (ctx.state === "suspended") void ctx.resume();

  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    playing = source;
    source.start();
  });
}

/** Last resort if audio cannot be decoded or generated at all. */
function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.45;
    utterance.rate = 0.96;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

/**
 * Speaks a line. `id` selects a stored clip when one exists; otherwise the
 * text is sent for synthesis. Either way the same treatment is applied.
 */
export async function speak(id: string, text: string): Promise<void> {
  stopSpeaking();

  try {
    const clips = await loadManifest();

    const buffer = clips.has(id)
      ? await processed(id, () =>
          fetch(`/voice/${id}.mp3`).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.arrayBuffer();
          }),
        )
      : await processed(`gen:${text}`, () =>
          fetch("/api/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.arrayBuffer();
          }),
        );

    if (buffer) return await play(buffer);
  } catch {
    // Fall through to the system voice rather than saying nothing at all.
  }

  return speakWithBrowser(text);
}
