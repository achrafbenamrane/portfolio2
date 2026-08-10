"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FALLBACK, GREETING, type VoiceAction } from "@/content/voice";
import { matchIntent } from "@/lib/voice/match";
import {
  isSupported,
  listenOnce,
  type RecognizerError,
} from "@/lib/voice/recognizer";
import { hasClonedVoice, loadManifest, speak, stopSpeaking } from "@/lib/voice/speaker";
import { AppWindow } from "./apps";
import { useAimTarget } from "./desktop-pointer";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";

const ERROR_COPY: Record<RecognizerError, string> = {
  unsupported:
    "This browser has no speech recognition. Chrome, Edge or Safari will work.",
  denied: "Microphone blocked. Allow it in the address bar and try again.",
  "no-speech": "I didn't hear anything. Tap and speak.",
  network: "Speech recognition needs a connection and could not reach it.",
  failed: "Something went wrong with the microphone.",
};

/** A few examples, so nobody has to guess what it understands. */
const SUGGESTIONS = [
  "Show me your work",
  "Are you available?",
  "How do I contact you?",
  "Open the Quran",
];

export default function SiriApp({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction: (action: VoiceAction) => void;
}) {
  // Seeded to the greeting rather than set from an effect: assigning these
  // synchronously on mount is the cascading render the compiler rules flag.
  const [phase, setPhase] = useState<Phase>("speaking");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string>(GREETING.speech);
  const [error, setError] = useState<string | null>(null);
  const [cloned, setCloned] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const supported = isSupported();

  useEffect(() => {
    void loadManifest().then(() => setCloned(hasClonedVoice()));
  }, []);

  // Greet once on open, so the assistant has a voice before being asked.
  useEffect(() => {
    let cancelled = false;
    void speak(GREETING.id, GREETING.speech).then(() => {
      if (!cancelled) setPhase("idle");
    });
    return () => {
      cancelled = true;
      stopSpeaking();
      stopRef.current?.();
    };
  }, []);

  const respond = useCallback(
    async (heard: string) => {
      setPhase("thinking");
      const match = matchIntent(heard);
      const line = match
        ? { id: match.intent.id, speech: match.intent.speech }
        : FALLBACK;

      setReply(line.speech);
      setPhase("speaking");

      // The action fires with the reply rather than after it, so the window is
      // already opening while the sentence is still being said — which is what
      // makes it feel like an assistant instead of a form.
      if (match) onAction(match.intent.action);

      await speak(line.id, line.speech);
      setPhase("idle");
    },
    [onAction],
  );

  const listen = useCallback(() => {
    if (!supported) {
      setError(ERROR_COPY.unsupported);
      setPhase("error");
      return;
    }
    stopSpeaking();
    setError(null);
    setTranscript("");
    setReply("");
    setPhase("listening");

    stopRef.current = listenOnce({
      onPartial: setTranscript,
      onFinal: (text) => {
        setTranscript(text);
        void respond(text);
      },
      onError: (code) => {
        setError(ERROR_COPY[code]);
        setPhase("error");
      },
    });
  }, [respond, supported]);

  const micRef = useAimTarget<HTMLButtonElement>("siri:mic", listen);

  return (
    <AppWindow title="Assistant" onClose={onClose} width={430}>
      <div className="siri">
        <Orb phase={phase} />

        <p className="siri-transcript">
          {transcript ? `“${transcript}”` : " "}
        </p>
        <p className="siri-reply">{error ?? reply}</p>

        <button
          ref={micRef}
          type="button"
          onClick={listen}
          className={`siri-mic${phase === "listening" ? " is-live" : ""}`}
          disabled={phase === "listening"}
        >
          {phase === "listening" ? "Listening…" : "Tap and speak"}
        </button>

        <ul className="siri-hints">
          {SUGGESTIONS.map((hint) => (
            <li key={hint}>“{hint}”</li>
          ))}
        </ul>

        {/* Truthful about where the audio goes. The hand tracking really is
            on-device; this is not, and saying so protects both claims. */}
        <p className="siri-note">
          {cloned
            ? "Replies in Achraf's own voice. "
            : "Replies use the browser voice until the cloned clips ship. "}
          {"Speech is transcribed by your browser's service, not on this device."}
        </p>
      </div>
    </AppWindow>
  );
}

/** Siri's orb: idle breathes, listening pulses, speaking ripples. */
function Orb({ phase }: { phase: Phase }) {
  return (
    <div className={`orb is-${phase}`}>
      <span className="orb-core" />
      <span className="orb-ring" />
      <span className="orb-ring orb-ring-2" />
    </div>
  );
}
