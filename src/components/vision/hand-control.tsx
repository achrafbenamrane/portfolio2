"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import { useInstrument } from "./instrument";
import { useVisionSignal } from "./vision-signal";

const getServerVersion = () => 0;

/**
 * The hand-control card: the camera feed with the tracked hand over it, the
 * openness readout, and the button that turns the camera on. Built for the
 * dark panel the portrait sits in; the desktop's Vision app has its own,
 * windowed version of the same instrument.
 */
export default function HandControl({ className = "" }: { className?: string }) {
  const signal = useVisionSignal();
  const feedRef = useRef<HTMLCanvasElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);

  useSyncExternalStore(signal.subscribe, signal.getVersion, getServerVersion);
  const { status } = signal;

  const handleEnable = useCallback(() => {
    void signal.enableCamera();
  }, [signal]);

  useInstrument(signal, { feed: feedRef, percent: percentRef, state: stateRef });

  const isLive = status === "running";
  const isBusy = status === "requesting" || status === "loading";
  const unavailable = status === "denied" || status === "unsupported";

  // The prompt is the whole point of the panel for a first-time visitor: the
  // fold is the one thing here nobody will discover on their own, because
  // nothing about a webcam feed says "your hand drives the artwork". It
  // retires the moment the camera is live — by then the caption under the
  // card carries the instruction, and a permanent callout is just noise.
  const showGuide = !isLive && !unavailable;

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${className}`}>
      <div className="w-full max-w-62 shrink-0 select-none overflow-hidden rounded-lg border border-line bg-surface-1/90 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-2">
          {/* The window dots go first on the narrowest phones, where the
              card is under 200px and the title would otherwise wrap. */}
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-line max-[339px]:hidden" />
            <span className="size-1.5 rounded-full bg-line max-[339px]:hidden" />
            <span className="size-1.5 rounded-full bg-line max-[339px]:hidden" />
            <span className="meta ml-1.5 whitespace-nowrap text-dim max-[339px]:ml-0">
              HAND CONTROL
            </span>
          </div>
          <span className="meta text-accent tabular-nums">
            <span ref={percentRef}>100%</span>
          </span>
        </div>

        {/* surface-2, not canvas: the webcam feed is typically a dim room,
            and a dark rectangle needs a recessed well to sit in rather than
            a hole punched in white.

            On a phone the well only opens once there is a picture to put in
            it — held at 4:3 while idle it is 186px of empty grey. */}
        <div
          className={`relative w-full bg-surface-2 ${
            isLive ? "aspect-4/3" : "sm:aspect-4/3"
          }`}
        >
          <canvas
            ref={feedRef}
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />

          {!isLive && (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center sm:absolute sm:inset-0 sm:py-0">
              {unavailable ? (
                <p className="text-[11px] leading-snug text-dim">
                  {status === "denied"
                    ? "Camera blocked. Allow it in site settings to fold."
                    : "No camera on this device."}
                </p>
              ) : (
                <button
                  onClick={handleEnable}
                  disabled={isBusy}
                  className="rounded-full border border-line px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {isBusy ? "Starting…" : "Enable hand control"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-2.5 py-1.5">
          <span className="meta text-dim">
            <span ref={stateRef}>PORTRAIT</span>
          </span>
          <span className="meta text-dim">ON-DEVICE</span>
        </div>
      </div>

      {showGuide && (
        <aside className="flex max-w-56 items-start gap-2.5 sm:gap-3">
          {/* Points back at the card. Rotated a quarter turn when the guide
              stacks underneath on narrow screens, so it never points at
              nothing. */}
          <span
            aria-hidden
            className="nudge mt-px shrink-0 rotate-90 text-[#7CC4F0] sm:rotate-0"
          >
            ←
          </span>

          <div className="border-l border-white/25 pl-3">
            <p className="meta text-[#7CC4F0]">TRY IT</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/70">
              This portrait is <span className="text-white">live</span>. Turn on
              your camera, then open and close your hand to fold it into paper.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
