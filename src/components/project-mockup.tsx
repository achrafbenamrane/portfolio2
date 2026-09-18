import Image from "next/image";

/**
 * Project mockups: a device on a tinted stage, drawn entirely in CSS.
 *
 * Still no stock artwork — nothing rasterised means it stays sharp at any
 * size, there is no licence to carry, and the frames use this site's own
 * tokens. What changed from the first attempt is that bare window chrome
 * around a screenshot reads as a UI detail rather than as a product shot. A
 * real mockup needs three things it was missing: a device with volume (a
 * laptop has a base, a phone has a thick bezel), a stage colour behind it, and
 * a shadow that puts the two in the same space.
 *
 * The frame follows the category, because the wrong one misrepresents the
 * work: a website shown in a phone is a lie about the project.
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
 * Stage colours, one per discipline.
 *
 * Deep and desaturated on purpose. The screenshots are bright and busy, so a
 * saturated stage would fight them; these sit behind and let the screen be the
 * brightest thing in the frame.
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
  /** Remote images skip the optimiser; Cloudinary already serves them sized. */
  unoptimized?: boolean;
  priority?: boolean;
}

export default function ProjectMockup({
  category,
  src,
  alt,
  unoptimized,
  priority,
}: MockupProps) {
  const device = deviceFor(category);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ background: stageFor(category) }}
    >
      {/* A wide, very soft highlight. One radial gradient is enough to stop the
          stage reading as flat card stock, and costs no image. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 60%)",
        }}
      />

      <div className="relative px-6 pt-10 sm:px-10 sm:pt-14">
        {device === "phone" && (
          <Phone src={src} alt={alt} unoptimized={unoptimized} priority={priority} />
        )}
        {device === "laptop" && (
          <Laptop src={src} alt={alt} unoptimized={unoptimized} priority={priority} />
        )}
        {device === "plate" && (
          <Plate src={src} alt={alt} unoptimized={unoptimized} priority={priority} />
        )}
      </div>
    </div>
  );
}

type BodyProps = Omit<MockupProps, "category">;

/**
 * Lid, hinge and base.
 *
 * The base is what makes it read as a laptop rather than a floating screen,
 * and it has to be WIDER than the lid — that overhang is the single strongest
 * cue, more than any amount of bezel detail.
 */
function Laptop({ src, alt, unoptimized, priority }: BodyProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-t-xl border-x-[10px] border-t-[10px] border-[#11181F] bg-[#11181F]">
        <div className="relative aspect-16/10 overflow-hidden rounded-t-[4px] bg-surface-2">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 55vw, 90vw"
            unoptimized={unoptimized}
            priority={priority}
            className="object-cover object-top"
          />
        </div>
      </div>

      {/* Overhangs the lid on both sides; the notch is the thumb cut-out. */}
      <div className="relative -mx-[3.5%] h-3.5 rounded-b-xl bg-gradient-to-b from-[#2A333C] to-[#151C23] sm:h-4">
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-1.5 w-16 -translate-x-1/2 rounded-b-lg bg-[#11181F]"
        />
      </div>
    </div>
  );
}

function Phone({ src, alt, unoptimized, priority }: BodyProps) {
  return (
    <div className="mx-auto w-full max-w-[16rem]">
      <div className="relative rounded-[2.25rem] border-[9px] border-[#11181F] bg-[#11181F] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.6rem] bg-surface-2">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 22vw, 60vw"
            unoptimized={unoptimized}
            priority={priority}
            className="object-cover object-top"
          />
          {/* Drawn over the screen, not cut from the bezel — a notch carved
              out of the border would clip the screenshot. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#11181F]"
          />
        </div>
      </div>
    </div>
  );
}

/** Print and branding: a plain plate, because a device would misrepresent it. */
function Plate({ src, alt, unoptimized, priority }: BodyProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-surface-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 45vw, 90vw"
          unoptimized={unoptimized}
          priority={priority}
          className="object-cover"
        />
      </div>
    </div>
  );
}
