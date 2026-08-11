/**
 * Playback for the assistant's replies.
 *
 * Every scripted line is pre-rendered in Achraf's cloned voice and shipped as
 * a static file, so at runtime this is an `<audio>` play — no API key, no
 * per-request cost, no latency, and it works offline. `npm run voice:lines`
 * regenerates them.
 *
 * Until those clips exist the browser's own speech synthesis stands in. It
 * sounds nothing like him, which is the point: the feature is usable while the
 * recording is outstanding, and obviously unfinished rather than silently
 * broken.
 */

const MANIFEST_URL = "/voice/manifest.json";

// Chrome populates the voice list asynchronously and fires this once ready.
// Without it the first reply of a session gets whatever the default is.
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.addEventListener("voiceschanged", () => {
    chosenVoice = undefined;
  });
}

let manifest: Set<string> | null = null;
let manifestPromise: Promise<Set<string>> | null = null;

/** Which lines have a real clip. Fetched once; absent manifest means none. */
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

let current: HTMLAudioElement | null = null;

export function stopSpeaking() {
  if (current) {
    current.pause();
    current = null;
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/**
 * Picks a male English system voice.
 *
 * Left alone, `speechSynthesis` uses the platform default — Zira on Windows,
 * which is female, so a portfolio that speaks as Achraf answered in a woman's
 * voice. There is no reliable gender field, so this matches on the names the
 * major platforms actually ship.
 */
const MALE_VOICE = /\b(david|daniel|alex|george|james|fred|mark|guy|male)\b/i;

let chosenVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosenVoice !== undefined) return chosenVoice;

  const voices = speechSynthesis.getVoices();
  // getVoices() is empty until the list loads; stay undefined so the next
  // call tries again rather than caching a miss forever.
  if (voices.length === 0) return null;

  const english = voices.filter((voice) => voice.lang.startsWith("en"));
  chosenVoice =
    english.find((voice) => MALE_VOICE.test(voice.name)) ??
    english[0] ??
    null;
  return chosenVoice;
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    // Deep and a little slow, to sit closer to the robot treatment on the
    // recorded clips. It cannot match them — synthesis output cannot be routed
    // through Web Audio, so no effect can be applied to it — but a low flat
    // pitch is the part of that character this API can actually reach.
    utterance.pitch = 0.45;
    utterance.rate = 0.96;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

/**
 * Speaks a line, preferring its cloned clip. Resolves when the audio finishes,
 * so the caller can hold the UI in its "speaking" state for exactly that long.
 */
export async function speak(id: string, text: string): Promise<void> {
  stopSpeaking();

  const clips = await loadManifest();
  if (!clips.has(id)) return speakWithBrowser(text);

  return new Promise((resolve) => {
    const audio = new Audio(`/voice/${id}.mp3`);
    current = audio;
    audio.onended = () => {
      if (current === audio) current = null;
      resolve();
    };
    // A clip listed in the manifest but missing on disk should still talk.
    audio.onerror = () => {
      if (current === audio) current = null;
      void speakWithBrowser(text).then(resolve);
    };
    void audio.play().catch(() => {
      if (current === audio) current = null;
      void speakWithBrowser(text).then(resolve);
    });
  });
}
