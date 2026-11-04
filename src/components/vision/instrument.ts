"use client";

import { useEffect } from "react";

import type { VisionSignal } from "@/lib/vision/signal";
import { HAND_CONNECTIONS } from "@/lib/vision/landmarks";

/**
 * The readouts every hand panel shows — the openness percentage, the state,
 * and the camera feed with the tracked hand drawn over it — written straight
 * to the DOM each frame. Routing a 60 Hz value through React would re-render
 * the panel sixty times a second for a two-digit number.
 *
 * The feed is drawn from the signal's shared video element, not from a
 * video of the panel's own: the stream belongs to the section, and any
 * number of panels can show it.
 */
export function useInstrument(
  signal: VisionSignal,
  refs: {
    feed: React.RefObject<HTMLCanvasElement | null>;
    percent: React.RefObject<HTMLElement | null>;
    state: React.RefObject<HTMLElement | null>;
  },
) {
  const { feed, percent, state } = refs;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      write(percent.current, `${Math.round(signal.displayValue * 100)}%`);
      write(
        state.current,
        signal.mode === "hand"
          ? signal.sensor.frame.hasHand
            ? signal.sensor.frame.isClosed
              ? "CLOSED"
              : "OPEN"
            : "NO HAND"
          : "PORTRAIT",
      );
      drawFeed(feed.current, signal.video, signal.sensor.frame.landmarks);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [signal, feed, percent, state]);
}

/** Only on a change: setting the same text replaces the text node, and
 *  doing that every frame keeps the page re-laying out for nothing. */
function write(element: HTMLElement | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
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
      .trim() || "#FF9A92";
  return cachedAccent;
}

/** The camera frame, then the hand's skeleton over it. Mirroring is the
 *  canvas's CSS, so a raised right hand reads as one on screen. */
function drawFeed(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  landmarks: { x: number; y: number }[] | null,
): void {
  if (!canvas || !video || !video.videoWidth || video.readyState < 2) return;

  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
