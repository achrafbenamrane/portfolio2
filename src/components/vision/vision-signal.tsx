"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { VisionSignal } from "@/lib/vision/signal";

const VisionSignalContext = createContext<VisionSignal | null>(null);

/**
 * One camera, one hand model, shared by everything in the section that reads
 * a hand — the portrait's fold, the panel's readout, the desktop's finger
 * cursor.
 *
 * It also owns the camera's video element. Kept here, mounted for the life of
 * the section and never inside a window, so closing the window that shows the
 * feed cannot pull the stream out from under the cursor. Previews draw from
 * it onto canvases of their own. It is 1px and transparent rather than
 * `display: none`, because a video that is not rendered may stop decoding.
 */
export function VisionSignalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [signal] = useState(() => new VisionSignal());

  useEffect(() => {
    signal.start();
    return () => signal.stop();
  }, [signal]);

  return (
    <VisionSignalContext.Provider value={signal}>
      {children}
      <video
        ref={(element) => signal.attachVideo(element)}
        aria-hidden
        tabIndex={-1}
        playsInline
        muted
        className="pointer-events-none fixed left-0 top-0 size-px opacity-0"
      />
    </VisionSignalContext.Provider>
  );
}

export function useVisionSignal(): VisionSignal {
  const signal = useContext(VisionSignalContext);
  if (!signal) {
    throw new Error("useVisionSignal must be used inside a VisionSignalProvider");
  }
  return signal;
}
