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

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
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
