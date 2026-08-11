"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FALLBACK,
  GREETING,
  UNAVAILABLE,
  type VoiceAction,
} from "@/content/voice";
import { matchIntent } from "@/lib/voice/match";
import {
  isSupported,
  listenOnce,
  type RecognizerError,
} from "@/lib/voice/recognizer";
import { loadManifest, speak, stopSpeaking } from "@/lib/voice/speaker";
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

/** Two commands and two open questions, so it is obvious it does both. */
const SUGGESTIONS = [
  "Show me your work",
  "What did you build with Next.js?",
  "Tell me about your security background",
  "Are you available?",
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
  const stopRef = useRef<(() => void) | null>(null);
  const supported = isSupported();

  // Warm the manifest so the first reply does not wait on it.
  useEffect(() => {
    void loadManifest();
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

      // Deterministic first, always. Commands and the common questions resolve
      // instantly, in Achraf's recorded voice, for nothing — only genuinely
      // novel questions reach the model, which is what keeps a public endpoint
      // affordable.
      const match = matchIntent(heard);
      if (match) {
        setReply(match.intent.speech);
        setPhase("speaking");
        // The action fires with the reply rather than after it, so the window
        // is already opening while the sentence is still being said — which is
        // what makes it feel like an assistant instead of a form.
        onAction(match.intent.action);
        await speak(match.intent.id, match.intent.speech);
        setPhase("idle");
        return;
      }

      // Nothing matched, so this is headed for the model. Noise and single
      // stray words stop here instead: there is nothing to answer, and a
      // request per cough is a request per cough billed. This check sits AFTER
      // the intent pass on purpose — "close" and "help" are one word each and
      // are perfectly valid commands.
      if (heard.trim().split(/\s+/).filter(Boolean).length < 2) {
        setReply(FALLBACK.speech);
        setPhase("speaking");
        await speak(FALLBACK.id, FALLBACK.speech);
        setPhase("idle");
        return;
      }

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: heard }),
        });

        if (!response.ok) throw new Error(String(response.status));
        const { answer } = (await response.json()) as { answer?: string };
        if (!answer) throw new Error("empty");

        setReply(answer);
        setPhase("speaking");

        // No stored clip exists for a sentence written just now, so speak()
        // has it synthesised — then runs the same robot treatment it runs on
        // the stored clips, so the two are indistinguishable.
        await speak("__generated__", answer);
        setPhase("idle");
      } catch {
        // Understood but unanswerable — say that, rather than blaming the
        // listener for a question that arrived perfectly well.
        setReply(UNAVAILABLE.speech);
        setPhase("speaking");
        await speak(UNAVAILABLE.id, UNAVAILABLE.speech);
        setPhase("idle");
      }
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
        <Avatar phase={phase} />

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
          {"Speech is transcribed by your browser's service, not on this device."}
        </p>
      </div>
    </AppWindow>
  );
}

/**
 * The assistant's face: a cut-out of Achraf as an android.
 *
 * Floated rather than masked into a circle — the alpha already excludes the
 * corners, so a circle would only crop the cheeks and make it read as a
 * profile picture instead of a character. State lives in the glow and rings
 * BEHIND the head, so the face itself never distorts.
 */
function Avatar({ phase }: { phase: Phase }) {
  return (
    <div className={`avatar is-${phase}`}>
      <span className="avatar-glow" />
      <span className="avatar-ring" />
      <span className="avatar-ring avatar-ring-2" />
      <Image
        src="/robot-head.webp"
        alt=""
        width={224}
        height={224}
        className="avatar-face"
        priority
      />
    </div>
  );
}
