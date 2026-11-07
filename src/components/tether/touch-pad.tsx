"use client";

import { useEffect, useRef, useState } from "react";

import type { Game } from "./game";
import type { Intent } from "./intent";

/** What the thumbs are doing. It lives outside React: the game reads it every frame. */
class Thumbs {
  x = 0;
  y = 0;
  fire = false;
  block = false;
  private queued: Partial<Intent> = {};

  queue(change: Partial<Intent>) {
    this.queued = { ...this.queued, ...change };
  }

  push(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  hold(key: "fire" | "block", down: boolean) {
    this[key] = down;
  }

  apply(intent: Intent, flying: boolean) {
    if (flying) {
      intent.pitch = this.y;
      intent.roll = this.x;
      intent.fire = this.fire;
    } else {
      intent.move = -this.y;
      intent.turn = this.x;
      intent.run = Math.abs(this.y) > 0.8;
      intent.block = this.block;
    }
    Object.assign(intent, this.queued);
    this.queued = {};
  }
}

/** A stick and some buttons, for anyone playing on a phone without the camera. */
export default function TouchPad({ game, flying }: { game: Game; flying: boolean }) {
  const [thumbs] = useState(() => new Thumbs());
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    game.useTouch((intent) => thumbs.apply(intent, flying));
    return () => game.useTouch(null);
  }, [game, flying, thumbs]);

  const steer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (!pad || event.buttons === 0) return;
    const box = pad.getBoundingClientRect();
    const reach = box.width / 2;
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left - reach) / reach));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top - reach) / reach));
    thumbs.push(x, y);
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * reach * 0.6}px, ${y * reach * 0.6}px)`;
  };

  const release = () => {
    thumbs.push(0, 0);
    if (knobRef.current) knobRef.current.style.transform = "";
  };

  return (
    <div className="tether-touch">
      <div
        ref={padRef}
        className="tether-stick"
        role="application"
        aria-label="Steering stick"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          steer(event);
        }}
        onPointerMove={steer}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span ref={knobRef} />
      </div>
      <div className="tether-pads">
        {flying ? (
          <>
            <button type="button" onPointerDown={() => thumbs.hold("fire", true)} onPointerUp={() => thumbs.hold("fire", false)} onPointerLeave={() => thumbs.hold("fire", false)}>
              Fire
            </button>
            <button type="button" onClick={() => thumbs.queue({ missile: true })}>Missile</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => thumbs.queue({ punchLeft: true })}>Punch L</button>
            <button type="button" onClick={() => thumbs.queue({ punchRight: true })}>Punch R</button>
            <button type="button" onPointerDown={() => thumbs.hold("block", true)} onPointerUp={() => thumbs.hold("block", false)} onPointerLeave={() => thumbs.hold("block", false)}>
              Block
            </button>
            <button type="button" onClick={() => thumbs.queue({ jump: true })}>Jump</button>
            <button type="button" onClick={() => thumbs.queue({ prone: !game.intent.prone })}>Lie down</button>
            <button type="button" onClick={() => thumbs.queue({ use: true })}>Use</button>
          </>
        )}
      </div>
    </div>
  );
}
