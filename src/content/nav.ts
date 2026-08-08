/**
 * Shared by the nav (a client component) and the home page (a server one).
 *
 * It lives here rather than alongside the nav because exports from a
 * `"use client"` module arrive at a server component as client references, not
 * as their actual values — so a plain array imported across that boundary is
 * not an array by the time the server tries to map over it.
 */
export const SECTIONS = [
  { label: "WORK", href: "/work" },
  { label: "EXPERIENCE", href: "/experience" },
  { label: "CERTIFICATIONS", href: "/certifications" },
  { label: "CONTACT", href: "/contact" },
] as const;
