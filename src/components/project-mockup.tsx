import Image from "next/image";

/**
 * Project mockups: a device on a tinted stage, drawn entirely in CSS.
 *
 * No stock artwork — nothing rasterised means it stays sharp at any size,
 * there is no licence to carry, and the frames use this site's own tokens.
 *
 * Ratios are held by a padding-top spacer rather than `aspect-ratio`. Both
 * work, but padding resolves from the element's own width with no dependency
 * on how the box was sized, so a screen can never collapse to nothing if a
 * parent's height is indefinite. On a page that is almost entirely images,
 * that failure would take the whole layout with it.
 */

export type Device = "laptop" | "phone" | "plate";

export function deviceFor(category: string): Device {
  switch (category) {
    case "Mobile Development":
      return "phone";
    case "Graphic Design":
      return "plate";
    default:
      return "laptop";
  }
}

/**
 * Stage colours, one per discipline. Deep and desaturated on purpose: the
 * screenshots are bright and busy, so a saturated stage fights them instead of
 * sitting behind them.
 */
const STAGE: Record<string, string> = {
  "Mobile Development":
    "linear-gradient(150deg,#0F3B33 0%,#14544A 55%,#0C2E28 100%)",
  "Web Development":
    "linear-gradient(150deg,#0E2438 0%,#1B4A78 55%,#0B1C2C 100%)",
  "Desktop Development":
    "linear-gradient(150deg,#232B33 0%,#3A4754 55%,#1A2027 100%)",
  "AI Automation":
    "linear-gradient(150deg,#241B3D 0%,#3E2F66 55%,#191333 100%)",
  "Graphic Design":
    "linear-gradient(150deg,#3A2418 0%,#6B4327 55%,#2A1A11 100%)",
};

export function stageFor(category: string) {
  return STAGE[category] ?? STAGE["Web Development"];
}

interface MockupProps {
  category: string;
  src: string;
  alt: string;
  unoptimized?: boolean;
  priority?: boolean;
}

/** A ratio box that cannot collapse: height comes from its own width. */
function Ratio({
  percent,
  className = "",
  children,
}: {
  percent: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative w-full ${className}`}>
      <div style={{ paddingTop: `${percent}%` }} />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

function Shot({ src, alt, unoptimized, priority, sizes }: MockupProps & { sizes: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={unoptimized}
      priority={priority}
      className="object-cover object-top"
    />
  );
}

export default function ProjectMockup(props: MockupProps) {
  const device = deviceFor(props.category);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ background: stageFor(props.category) }}
    >
      {/* One wide, soft highlight so the stage is not flat card stock. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 60%)",
        }}
      />

      <div className="relative px-6 pt-10 sm:px-10 sm:pt-14">
        {device === "phone" ? (
          <Phone {...props} />
        ) : device === "laptop" ? (
          <Laptop {...props} />
        ) : (
          <Plate {...props} />
        )}
      </div>
    </div>
  );
}

/**
 * Lid, hinge and base. The base must OVERHANG the lid — that overhang is the
 * strongest cue that this is a laptop rather than a floating screen, more than
 * any amount of bezel detail.
 */
function Laptop(props: MockupProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-t-xl border-x-[10px] border-t-[10px] border-[#11181F] bg-[#11181F]">
        <Ratio percent={62.5} className="overflow-hidden rounded-t-[4px] bg-surface-2">
          <Shot {...props} sizes="(min-width: 768px) 55vw, 90vw" />
        </Ratio>
      </div>

      <div className="relative -mx-[3.5%] h-3.5 rounded-b-xl bg-gradient-to-b from-[#2A333C] to-[#151C23] sm:h-4">
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-1.5 w-16 -translate-x-1/2 rounded-b-lg bg-[#11181F]"
        />
      </div>
    </div>
  );
}

function Phone(props: MockupProps) {
  return (
    <div className="mx-auto w-full max-w-[15rem]">
      <div className="relative rounded-[2.25rem] border-[9px] border-[#11181F] bg-[#11181F] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <Ratio percent={216} className="overflow-hidden rounded-[1.6rem] bg-surface-2">
          <Shot {...props} sizes="(min-width: 768px) 22vw, 60vw" />
          {/* Over the screen, not cut from the bezel — a carved notch would
              clip the screenshot. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#11181F]"
          />
        </Ratio>
      </div>
    </div>
  );
}

/** Print and branding: a plain plate, because a device would misrepresent it. */
function Plate(props: MockupProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Ratio
        percent={75}
        className="overflow-hidden rounded-lg bg-surface-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
      >
        <Shot {...props} sizes="(min-width: 768px) 45vw, 90vw" />
      </Ratio>
    </div>
  );
}
