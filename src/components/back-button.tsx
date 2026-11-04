/**
 * The way back out of a close-up: a pill with the arrow in a disc, set top
 * left, where a way back is looked for first. Drawn as a button rather than
 * a line of small print, so it reads as one at a glance.
 *
 * Callers place it and choose its transition, since one fades in with the
 * copy around it and another waits for a phone to land. `small` and
 * `accent` match it to a button beside it — the sites' 36px red
 * "Visit site".
 */
const SIZES = {
  regular: {
    pill: "gap-3 py-1.5 pl-1.5 pr-5 text-sm",
    disc: "size-8 text-base",
  },
  small: {
    pill: "h-9 gap-2 pl-1 pr-4 text-[13px]",
    disc: "size-7 text-sm",
  },
} as const;

const TONES = {
  light: {
    pill: "border-line bg-canvas text-ink shadow-[0_8px_22px_-10px_rgba(40,27,28,0.45)] hover:border-accent hover:text-accent",
    disc: "bg-ink text-canvas group-hover/back:bg-accent",
  },
  accent: {
    pill: "border-transparent bg-accent text-canvas shadow-[0_8px_24px_-6px_rgba(179,18,42,0.55)] hover:bg-ink",
    disc: "bg-canvas text-accent group-hover/back:text-ink",
  },
} as const;

export default function BackButton({
  label,
  onClick,
  ref,
  inert,
  size = "regular",
  tone = "light",
  className = "",
  style,
}: {
  label: string;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  inert?: boolean;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = SIZES[size];
  const t = TONES[tone];

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      inert={inert}
      style={style}
      className={`group/back inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border font-semibold ${t.pill} ${s.pill} ${className}`}
    >
      <span
        aria-hidden
        className={`grid place-items-center rounded-full transition-[background-color,color,translate] duration-200 group-hover/back:-translate-x-0.5 ${t.disc} ${s.disc}`}
      >
        ←
      </span>
      {label}
    </button>
  );
}
