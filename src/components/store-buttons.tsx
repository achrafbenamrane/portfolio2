/**
 * The look every button in an app's row shares — its site and its stores —
 * so the three read as one set: white bubbles, like the way back above the
 * name, in ink, each led by its own mark in colour.
 *
 * The row is a container (`@container`), and when it is narrower than the
 * three need at full size (28rem) they turn compact and share its width
 * evenly, so they stay on one line down to a small phone.
 */
export const ACTION_BUTTON =
  "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-line bg-white text-ink shadow-[0_8px_22px_-10px_rgba(40,27,28,0.45)] transition-colors hover:border-accent @max-[28rem]:h-10 @max-[28rem]:min-w-0 @max-[28rem]:not-only:flex-1 @max-[28rem]:justify-center";

/** The leading mark in every button, sized with it. */
export const ACTION_ICON = "size-[22px] shrink-0 @max-[28rem]:size-4";

/**
 * The App Store and Google Play buttons: each store's own logo, in its own
 * colours, and its two-line label. Drawn here rather than pasted as the
 * stores' image badges, so they sit in the page's bubbles and type and
 * sharpen at any size. Only the stores a project lists appear, and they
 * join whatever row the caller puts them in.
 */
export default function StoreButtons({
  app,
  stores,
}: {
  /** The app's name, for the links' accessible names. */
  app: string;
  stores?: { appStore?: string; googlePlay?: string };
}) {
  if (!stores?.appStore && !stores?.googlePlay) return null;

  return (
    <>
      {stores.appStore && (
        <Badge
          href={stores.appStore}
          label={`Download ${app} on the App Store`}
          small="Download on the"
          big="App Store"
          icon={<AppStoreLogo />}
        />
      )}
      {stores.googlePlay && (
        <Badge
          href={stores.googlePlay}
          label={`Get ${app} on Google Play`}
          small="Get it on"
          big="Google Play"
          icon={<GooglePlayLogo />}
        />
      )}
    </>
  );
}

function Badge({
  href,
  label,
  small,
  big,
  icon,
}: {
  href: string;
  label: string;
  small: string;
  big: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`group/store ${ACTION_BUTTON} gap-2 pl-2 pr-4 @max-[28rem]:gap-1.5 @max-[28rem]:px-2`}
    >
      <span aria-hidden className={ACTION_ICON}>
        {icon}
      </span>
      <span aria-hidden className="flex flex-col leading-none">
        <span className="text-[9px] font-medium tracking-wide text-dim @max-[28rem]:text-[7.5px] @max-[28rem]:tracking-normal">
          {small}
        </span>
        <span className="mt-[3px] text-[15px] font-semibold tracking-tight transition-colors group-hover/store:text-accent @max-[28rem]:mt-[2px] @max-[28rem]:text-[11.5px]">
          {big}
        </span>
      </span>
    </a>
  );
}

/** The App Store icon: Apple's blue tile, lighter at the top, and the white
 *  "A" of its three strokes and the bar across them. */
function AppStoreLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-full">
      <defs>
        <linearGradient id="app-store-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#18BFFB" />
          <stop offset="1" stopColor="#2072F3" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="5.4" fill="url(#app-store-tile)" />
      <g stroke="#fff" strokeWidth="1.85" strokeLinecap="round" fill="none">
        <path d="M13.1 5.3 8.75 12.85" />
        <path d="M7.35 15.75 6.75 16.8" />
        <path d="M10.9 5.3 17.25 16.35" />
        <path d="M5.9 14.3H12.4" />
        <path d="M14.6 14.3H18.1" />
      </g>
    </svg>
  );
}

/** The Google Play mark: a rounded play triangle in Google's four colours —
 *  blue at the back, green above, red below, yellow at the point. */
function GooglePlayLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-full">
      <defs>
        <clipPath id="google-play-shape">
          <path d="M4.3 1.15 21.2 10.6q2.5 1.4 0 2.8L4.3 22.85Q2.4 23.9 2.4 21.7V2.3Q2.4.1 4.3 1.15Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#google-play-shape)">
        <path fill="#4285F4" d="M-1-1 13.2 12-1 25Z" />
        <path fill="#34A853" d="M-1-1 13.2 12 21.5 3.7V-1Z" />
        <path fill="#EA4335" d="M-1 25 13.2 12 21.5 20.3V25Z" />
        <path fill="#FBBC04" d="M13.2 12 21.5 3.7H26V20.3H21.5Z" />
      </g>
    </svg>
  );
}
