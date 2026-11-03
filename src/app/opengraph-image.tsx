import { ImageResponse } from "next/og";

import { site } from "@/content/site";

/**
 * The social card: Wolfexo's, not a person's. No face and no location, the
 * agency's name large on its navy, with the four things it makes.
 *
 * Typeset in Geist, which Next ships inside its OG compiler, so nothing is
 * fetched at build time. Only the regular weight is available, so the
 * hierarchy comes from size, colour and tracking.
 */

export const alt = `${site.brand} — ${site.brandLine}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0E2438";
const SKY = "#7CC4F0";
const WHITE = "#F8FAFC";
const DIM = "rgba(248, 250, 252, 0.62)";
const LINE = "rgba(248, 250, 252, 0.18)";

const SERVICES = ["Full-stack development", "Computer vision", "Brand identity"];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: `linear-gradient(160deg, ${NAVY} 0%, #133A5E 60%, #1B4A78 100%)`,
          color: WHITE,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderBottom: `1px solid ${LINE}`,
            paddingBottom: 18,
            fontSize: 20,
            letterSpacing: 4,
            color: DIM,
          }}
        >
          <span>/ AGENCY</span>
          <span style={{ color: SKY }}>{site.availability}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 150, letterSpacing: 14, lineHeight: 1 }}>{site.brand.toUpperCase()}</div>
          <div style={{ marginTop: 26, fontSize: 34, color: DIM }}>
            Apps built end to end, software that can see, brands people recognise.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 36,
            borderTop: `1px solid ${LINE}`,
            paddingTop: 18,
            fontSize: 22,
            letterSpacing: 2,
            color: WHITE,
          }}
        >
          {SERVICES.map((service) => (
            <span key={service}>{service}</span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
