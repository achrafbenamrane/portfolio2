"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { HAND_CONNECTIONS } from "@/lib/vision/landmarks";
import { useHeroSignal } from "./hero-signal-context";

const getServerVersion = () => 0;

export default function HandControl({ className = "" }: { className?: string }) {
  const signal = useHeroSignal();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);

  useSyncExternalStore(signal.subscribe, signal.getVersion, getServerVersion);
  const { status } = signal;

  const handleEnable = useCallback(() => {
    const video = videoRef.current;
    if (video) void signal.enableCamera(video);
  }, [signal]);

  // Readouts are written straight to the DOM. Routing a 60 Hz value through
  // React would re-render the hero sixty times a second for a two-digit number.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const percent = Math.round(signal.displayValue * 100);

      if (percentRef.current) percentRef.current.textContent = `${percent}%`;
      if (stateRef.current) {
        stateRef.current.textContent =
          signal.mode === "hand"
            ? signal.sensor.frame.hasHand
              ? signal.sensor.frame.isClosed
                ? "CLOSED"
                : "OPEN"
              : "NO HAND"
            : "PORTRAIT";
      }

      drawOverlay(
        overlayRef.current,
        videoRef.current,
        signal.sensor.frame.landmarks,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [signal]);

  const isLive = status === "running";
  const isBusy = status === "requesting" || status === "loading";
  const unavailable = status === "denied" || status === "unsupported";

  return (
    <div
      className={`w-62 select-none overflow-hidden rounded-lg border border-line bg-surface-1/90 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-line" />
          <span className="size-1.5 rounded-full bg-line" />
          <span className="size-1.5 rounded-full bg-line" />
          <span className="meta ml-1.5 text-dim">HAND CONTROL</span>
        </div>
        <span className="meta text-accent tabular-nums">
          <span ref={percentRef}>100%</span>
        </span>
      </div>

      {/* surface-2, not canvas: the webcam feed is typically a dim room, and a
          dark rectangle needs a recessed well to sit in on a light page rather
          than a hole punched in white. Full opacity too — the 70% that softened
          it against black just washed it out here. */}
      <div className="relative aspect-4/3 w-full bg-surface-2">
        {/* Tagged so the desktop's Settings app can start the same stream —
            it lives in drei's detached React root and cannot reach this ref. */}
        <video
          ref={videoRef}
          data-hero-video
          className="absolute inset-0 size-full -scale-x-100 object-cover"
          playsInline
          muted
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 size-full -scale-x-100"
        />

        {!isLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
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
  );
}

/**
 * Read once from the stylesheet rather than duplicated as a literal — canvas
 * can't use CSS variables, and a hardcoded copy silently survives a palette
 * change, leaving the landmarks the only thing still wearing the old accent.
 */
let cachedAccent: string | null = null;

function accentColor(): string {
  cachedAccent ??=
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim() || "#7CD4FF";
  return cachedAccent;
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  landmarks: { x: number; y: number }[] | null,
): void {
  if (!canvas || !video || !video.videoWidth) return;

  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;

  const px = (i: number) => landmarks[i].x * canvas.width;
  const py = (i: number) => landmarks[i].y * canvas.height;

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
  }
  ctx.stroke();

  ctx.fillStyle = accentColor();
  for (let i = 0; i < landmarks.length; i++) {
    ctx.beginPath();
    ctx.arc(px(i), py(i), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
