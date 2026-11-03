"use client";

import { useEffect, useState } from "react";

/** Seconds until the next 10:00 on the visitor's own clock. */
function secondsLeft() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(10, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.floor((next.getTime() - now.getTime()) / 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Until my next coffee": a joke borrowed from Treize's countdown to their
 * next 5-à-7. Empty on the server, so the first paint never shows a time
 * that is already wrong.
 */
export default function CoffeeCountdown() {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(secondsLeft());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const parts =
    left === null
      ? ["--", "--", "--"]
      : [pad(Math.floor(left / 3600)), pad(Math.floor((left % 3600) / 60)), pad(left % 60)];

  return (
    <ul className="mt-4 space-y-1 text-[13px] uppercase tracking-wide tabular-nums">
      <li>{parts[0]} hours</li>
      <li>{parts[1]} minutes</li>
      <li>{parts[2]} seconds</li>
    </ul>
  );
}
