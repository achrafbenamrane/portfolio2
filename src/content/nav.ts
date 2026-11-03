/**
 * The site's main menu, in order. Shared by the nav (a client component) and
 * the sitemap (a server one).
 *
 * It lives here rather than alongside the nav because exports from a
 * `"use client"` module arrive at a server component as client references, not
 * as their actual values — so a plain array imported across that boundary is
 * not an array by the time the server tries to map over it.
 */
export const SECTIONS = [
  { label: "About us", href: "/about" },
  { label: "Expertise", href: "/expertise" },
  { label: "Projects", href: "/projects" },
  { label: "Case studies", href: "/case-studies", note: "New — ONEFRAME" },
  { label: "Industries", href: "/industries" },
  { label: "Contact", href: "/contact", note: "Reply within one working day" },
] as const;

/** Pages outside the menu that still belong in the sitemap. */
export const MORE_PAGES = [
  "/case-studies/oneframe",
  "/experience",
  "/certifications",
] as const;
