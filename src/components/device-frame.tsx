import Image from "next/image";

/**
 * Device mockups drawn in CSS rather than sourced as stock artwork.
 *
 * Three reasons this beats a downloaded PSD or PNG mockup: it stays sharp at
 * any size because nothing is rasterised, it carries no licence to honour or
 * attribute, and it is built from the site's own tokens so the frames belong
 * to this page instead of importing someone else's grey.
 *
 * The frame is chosen by what the work actually is. A website shown in a phone
 * is a lie about the project, and a phone app in a browser window is worse.
 */

export type Device = "browser" | "phone" | "desktop" | "flat";

/** Which frame suits each category. Print and branding get no device at all. */
export function deviceFor(category: string): Device {
  switch (category) {
    case "Mobile Development":
      return "phone";
    case "Desktop Development":
      return "desktop";
    case "Graphic Design":
      return "flat";
    default:
      return "browser";
  }
}

/** Domain only — a full URL in a fake address bar reads as clutter. */
function hostOf(href?: string) {
  if (!href) return "localhost";
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "localhost";
  }
}

interface FrameProps {
  device: Device;
  src: string;
  alt: string;
  href?: string;
  title: string;
  /** Remote images skip the optimiser; Cloudinary already serves them sized. */
  unoptimized?: boolean;
  priority?: boolean;
}

export default function DeviceFrame(props: FrameProps) {
  if (props.device === "phone") return <PhoneFrame {...props} />;
  if (props.device === "flat") return <FlatFrame {...props} />;
  return <WindowFrame {...props} />;
}

/** Browser and desktop share a shell; only the bar's contents differ. */
function WindowFrame({
  device,
  src,
  alt,
  href,
  title,
  unoptimized,
  priority,
}: FrameProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-[0_18px_40px_-24px_rgba(24,38,49,0.5)] transition-shadow duration-300 group-hover:shadow-[0_26px_60px_-24px_rgba(24,38,49,0.6)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
        </span>

        <span className="meta mx-auto max-w-[60%] truncate rounded-full bg-canvas px-3 py-1 text-dim">
          {device === "desktop" ? title : hostOf(href)}
        </span>

        {/* Balances the traffic lights so the address pill sits centred. */}
        <span aria-hidden className="w-[42px]" />
      </div>

      <div className="relative aspect-16/10 overflow-hidden bg-surface-2">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          unoptimized={unoptimized}
          priority={priority}
          className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
    </div>
  );
}

function PhoneFrame({ src, alt, unoptimized, priority }: FrameProps) {
  return (
    <div className="flex justify-center">
      <div className="relative w-[58%] max-w-[15rem] rounded-[2rem] border-[7px] border-ink bg-ink p-0 shadow-[0_22px_50px_-22px_rgba(24,38,49,0.6)] transition-shadow duration-300 group-hover:shadow-[0_30px_70px_-22px_rgba(24,38,49,0.7)]">
        {/* The pill, drawn over the screen rather than cut into the bezel —
            a notch carved from the border would clip the screenshot. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-ink/70"
        />

        <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.5rem] bg-surface-2">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 20vw, 50vw"
            unoptimized={unoptimized}
            priority={priority}
            className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </div>
    </div>
  );
}

/** Print and branding: a plain plate, because a device would misrepresent it. */
function FlatFrame({ src, alt, unoptimized, priority }: FrameProps) {
  return (
    <div className="relative aspect-4/3 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-[0_18px_40px_-24px_rgba(24,38,49,0.5)]">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1024px) 45vw, 100vw"
        unoptimized={unoptimized}
        priority={priority}
        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    </div>
  );
}
