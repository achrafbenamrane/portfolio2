import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { site } from "@/content/site";

/**
 * The social card.
 *
 * Typeset in Geist rather than a generic sans: Next ships Geist-Regular inside
 * its OG compiler, so it is the site's own face at no cost and with nothing
 * fetched at build time. Only the regular weight is available, so the name
 * lockup separates its two tiers by size, colour and tracking instead of by
 * weight — which is closer to the site's editorial idiom anyway.
 */

export const alt = `${site.name} — ${site.roles.join(", ")}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* The site's tokens, resolved out of oklch — satori has no oklch support. */
const CANVAS = "#FAFCFE";
const INK = "#182631";
const DIM = "#4F5D67";
const LINE = "#C3CCD3";
const ACCENT = "#24689B";

export default async function Image() {
  const portrait = await readFile(
    join(process.cwd(), "public", "portrait.png"),
  );
  const portraitSrc = `data:image/png;base64,${portrait.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: CANVAS,
          color: INK,
          padding: 56,
          justifyContent: "space-between",
        }}
      >
        {/* Top meta rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${LINE}`,
            paddingBottom: 18,
            fontSize: 20,
            letterSpacing: 4,
            color: DIM,
          }}
        >
          <span style={{ color: INK }}>{site.initials}</span>
          <span>PORTFOLIO</span>
        </div>

        {/* Name lockup + portrait */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flex: 1,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 54,
                letterSpacing: 8,
                color: DIM,
                lineHeight: 1.1,
              }}
            >
              {site.nameLines.light}
            </div>
            <div
              style={{
                fontSize: 104,
                letterSpacing: -2,
                color: INK,
                lineHeight: 1.05,
              }}
            >
              {site.nameLines.bold}
            </div>

            <div
              style={{
                display: "flex",
                width: 96,
                height: 3,
                background: ACCENT,
                margin: "26px 0",
              }}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 25,
                color: DIM,
                lineHeight: 1.5,
              }}
            >
              {site.roles.map((role) => (
                <span key={role}>{role}</span>
              ))}
            </div>
          </div>

          {/* Height is bounded by the space between the two rules, not chosen
              by eye: 630 − 112 padding − 43 per rule − 28 gap leaves ~404, and
              the portrait is a cut-out with a hard bottom crop, so anything
              taller slices through the bottom hairline. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitSrc}
            alt=""
            width={300}
            height={370}
            style={{ objectFit: "contain", objectPosition: "bottom" }}
          />
        </div>

        {/* Bottom meta rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 18,
            fontSize: 20,
            letterSpacing: 4,
            color: DIM,
          }}
        >
          <span style={{ color: ACCENT }}>{site.availability}</span>
          <span>{site.location}</span>
        </div>
      </div>
    ),
    size,
  );
}
