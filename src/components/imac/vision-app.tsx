"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import { useInstrument } from "@/components/vision/instrument";
import Portrait from "@/components/vision/portrait";
import type { VisionSignal } from "@/lib/vision/signal";
import { AppWindow } from "./apps";
import { useAimTarget } from "./desktop-pointer";

const getServerVersion = () => 0;

/**
 * The computer-vision demo as a desktop app: the live portrait on one side,
 * and on the other the instrument reading the hand — the camera feed with
 * the tracked skeleton, the openness, the state — with the button that turns
 * the camera on. The camera itself belongs to the section, not this window,
 * so closing it leaves the stream (and the finger cursor) running.
 *
 * Once the camera is live it also hands the visitor the desktop's other
 * trick — the finger cursor — which is otherwise behind the Settings app.
 */
export default function VisionApp({
  signal,
  pointing,
  onPoint,
  onClose,
}: {
  signal: VisionSignal;
  /** The finger cursor is already on. */
  pointing: boolean;
  /** Turn the finger cursor on and get out of its way. */
  onPoint: () => void;
  onClose: () => void;
}) {
  const feedRef = useRef<HTMLCanvasElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);

  useSyncExternalStore(signal.subscribe, signal.getVersion, getServerVersion);
  const { status } = signal;

  const enable = useCallback(() => {
    void signal.enableCamera();
  }, [signal]);
  const enableRef = useAimTarget<HTMLButtonElement>("vision:enable", enable);
  const pointRef = useAimTarget<HTMLButtonElement>("vision:point", onPoint);

  useInstrument(signal, { feed: feedRef, percent: percentRef, state: stateRef });

  const isLive = status === "running";
  const isBusy = status === "requesting" || status === "loading";
  const unavailable = status === "denied" || status === "unsupported";

  return (
    <AppWindow title="Vision — hand tracking" onClose={onClose} width={640}>
      <div className="vision-app">
        <Portrait className="vision-portrait" />

        <div className="vision-side">
          <div className="vision-feed">
            <canvas ref={feedRef} />
            {!isLive && (
              <div className="vision-cta">
                {unavailable ? (
                  <p>
                    {status === "denied"
                      ? "Camera blocked. Allow it in site settings to fold."
                      : "No camera on this device."}
                  </p>
                ) : (
                  <button
                    ref={enableRef}
                    type="button"
                    onClick={enable}
                    disabled={isBusy}
                    className="app-button is-primary"
                  >
                    {isBusy ? "Starting…" : "Enable hand control"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="vision-readout">
            <span ref={stateRef}>PORTRAIT</span>
            <span ref={percentRef} className="vision-percent">
              100%
            </span>
          </div>

          <p className="vision-hint">
            {isLive
              ? "Close your hand to fold him into paper."
              : "Turn on the camera, then open and close your hand in front of it to fold the portrait into paper."}
          </p>
          {isLive && !pointing && (
            <button
              ref={pointRef}
              type="button"
              onClick={onPoint}
              className="app-button vision-point"
            >
              Point at the desktop →
            </button>
          )}
          <p className="vision-privacy">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
        </div>
      </div>
    </AppWindow>
  );
}
