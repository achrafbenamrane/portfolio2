"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { HeroSignal } from "@/lib/vision/hero-signal";

const HeroSignalContext = createContext<HeroSignal | null>(null);

/**
 * Shares one signal between the canvas and the control panel.
 *
 * Context rather than props because the two consumers sit in different places
 * in the layout — the canvas is an absolute backdrop, the panel is in normal
 * document flow beneath the CTAs. Threading a prop would force them to be
 * siblings, which is exactly what made the panel overlap the hero copy.
 */
export function HeroSignalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [signal] = useState(() => new HeroSignal());

  useEffect(() => {
    signal.start();
    return () => signal.stop();
  }, [signal]);

  return (
    <HeroSignalContext.Provider value={signal}>
      {children}
    </HeroSignalContext.Provider>
  );
}

export function useHeroSignal(): HeroSignal {
  const signal = useContext(HeroSignalContext);
  if (!signal) {
    throw new Error("useHeroSignal must be used inside a HeroSignalProvider");
  }
  return signal;
}
