"use client";

import { useEffect, useState } from "react";

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1900;

/**
 * Types through the role list. The first role is rendered on the server at full
 * length, so the line occupies its final height before hydration — the effect
 * only ever starts by deleting, never by typing into an empty box. That's what
 * keeps CLS at zero.
 */
export default function RoleRotator({ roles }: { roles: readonly string[] }) {
  const [text, setText] = useState(roles[0]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let roleIndex = 0;
    let charIndex = roles[0].length;
    let deleting = true;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      const role = roles[roleIndex];

      if (deleting) {
        charIndex--;
        if (charIndex <= 0) {
          deleting = false;
          roleIndex = (roleIndex + 1) % roles.length;
        }
      } else {
        charIndex++;
        if (charIndex >= role.length) {
          deleting = true;
          setText(role);
          timer = setTimeout(step, HOLD_MS);
          return;
        }
      }

      setText(roles[roleIndex].slice(0, charIndex));
      timer = setTimeout(step, deleting ? DELETE_MS : TYPE_MS);
    };

    timer = setTimeout(step, HOLD_MS);
    return () => clearTimeout(timer);
  }, [roles]);

  return (
    // Light and widely tracked to match the top line of the name lockup — at
    // font-medium with tight tracking it read as a different typographic system
    // sitting directly under the black surname.
    <p className="mt-5 text-[clamp(0.95rem,2.1vw,1.4rem)] font-light tracking-[0.18em]">
      {text}
      <span
        aria-hidden
        className="ml-1 inline-block h-[1em] w-[2px] translate-y-[0.12em] animate-pulse bg-accent"
      />
    </p>
  );
}
