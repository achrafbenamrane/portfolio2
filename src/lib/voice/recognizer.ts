/**
 * Thin wrapper over the Web Speech API.
 *
 * PRIVACY — this is not like the hand tracking. MediaPipe runs on-device and
 * the video genuinely never leaves the machine. Speech recognition does not:
 * Chrome streams the audio to Google's servers to transcribe it. The UI says
 * so plainly, because claiming otherwise next to a truthful on-device claim
 * would make both untrustworthy.
 *
 * Support is real but partial — Chrome, Edge and Safari have it; Firefox does
 * not ship it at all. `isSupported()` is what the UI branches on.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSupported() {
  return getConstructor() !== null;
}

export type RecognizerError =
  | "unsupported"
  | "denied"
  | "no-speech"
  | "network"
  | "failed";

export interface RecognizerHandlers {
  /** Fires as the speaker talks, for live transcript display. */
  onPartial?: (text: string) => void;
  /** Fires once with the settled transcript. */
  onFinal: (text: string) => void;
  onError: (error: RecognizerError) => void;
  onEnd?: () => void;
}

/**
 * One utterance per call: start, capture, stop. Push-to-talk rather than an
 * always-on wake word — a portfolio that holds the microphone open on load is
 * hostile, and browsers would prompt for permission before anyone asked for it.
 */
export function listenOnce(handlers: RecognizerHandlers) {
  const Ctor = getConstructor();
  if (!Ctor) {
    handlers.onError("unsupported");
    return () => {};
  }

  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let settled = false;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        settled = true;
        handlers.onFinal(text.trim());
        return;
      }
      interim += text;
    }
    if (interim) handlers.onPartial?.(interim.trim());
  };

  recognition.onerror = (event) => {
    settled = true;
    const code = event.error;
    handlers.onError(
      code === "not-allowed" || code === "service-not-allowed"
        ? "denied"
        : code === "no-speech"
          ? "no-speech"
          : code === "network"
            ? "network"
            : "failed",
    );
  };

  recognition.onend = () => {
    // Chrome ends the session silently if it hears nothing at all, which would
    // otherwise leave the UI stuck in "listening" forever.
    if (!settled) handlers.onError("no-speech");
    handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    handlers.onError("failed");
  }

  return () => recognition.abort();
}
