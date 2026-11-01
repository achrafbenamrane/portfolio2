/**
 * The way back out of a close-up: a pill with the arrow in a dark disc,
 * set top left, where a way back is looked for first. Drawn as a button
 * rather than a line of small print, so it reads as one at a glance.
 *
 * Callers place it and choose its transition, since one fades in with the
 * copy around it and another waits for a phone to land.
 */
export default function BackButton({
  label,
  onClick,
  ref,
  inert,
  className = "",
  style,
}: {
  label: string;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  inert?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      inert={inert}
      style={style}
      className={`group/back inline-flex items-center gap-3 rounded-full border border-line bg-canvas py-1.5 pl-1.5 pr-5 text-sm font-semibold text-ink shadow-[0_8px_22px_-10px_rgba(14,36,56,0.45)] hover:border-accent hover:text-accent ${className}`}
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full bg-ink text-base text-canvas transition-[background-color,translate] duration-200 group-hover/back:-translate-x-0.5 group-hover/back:bg-accent"
      >
        ←
      </span>
      {label}
    </button>
  );
}
