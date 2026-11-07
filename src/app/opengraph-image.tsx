import { ImageResponse } from "next/og";

import { site } from "@/content/site";

/**
 * The social card: Achraf's name large on the red, with the role and the
 * three services. No face and no location.
 *
 * Typeset in Geist, which Next ships inside its OG compiler, so nothing is
 * fetched at build time. Only the regular weight is available, so the
 * hierarchy comes from size, colour and tracking.
 */

export const alt = `${site.brand} — ${site.brandLine}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RED = "#8F1024";
const ROSE = "#FFB4AE";
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
          background: `linear-gradient(160deg, ${RED} 0%, #A5142B 60%, #B81A33 100%)`,
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
          <span>/ FULL-STACK DEVELOPER</span>
          <span style={{ color: ROSE }}>{site.availability}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 124, letterSpacing: 10, lineHeight: 1.02 }}>
            {site.brand.toUpperCase().split(" ").map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
          <div style={{ marginTop: 26, fontSize: 34, color: DIM }}>
            {site.brandLine}
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
