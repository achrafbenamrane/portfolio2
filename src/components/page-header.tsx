/**
 * Shared masthead for the four content pages.
 *
 * The top padding clears the fixed nav, which is taller on small screens where
 * the links wrap onto their own strip.
 */
export default function PageHeader({
  index,
  title,
  description,
  meta,
}: {
  index: string;
  title: string;
  description: string;
  /**
   * The row that names the list beneath and counts it — "CREDENTIALS · 006
   * TOTAL". Rendered inside the band rather than by the page below it, so the
   * blue ends on that rule instead of stopping short of it.
   */
  meta?: { label: string; value: string };
}) {
  return (
    <header
      className="px-6 pb-10 pt-40 md:px-12 md:pt-36"
      style={{
        /* A medium blue — the iMac's shell colour — sitting between the navy
           bar above and the white page below. Only PURE white type clears AA
           on it (5.3:1 at the band's lightest point; the muted white variants
           fall to 3.9:1), so the label and description drop their opacity
           and take their hierarchy from size and weight instead. */
        background:
          "radial-gradient(80% 90% at 90% 0%, #3A7FBF 0%, transparent 60%)," +
          "linear-gradient(135deg, #245E95 0%, #2E6FA8 100%)",
      }}
    >
      <div className="mx-auto max-w-350">
        <p className="meta text-white">{index}</p>
        <h1 className="mt-4 text-[clamp(2.25rem,7vw,5rem)] font-semibold uppercase leading-[0.9] tracking-[-0.04em] text-white">
          {title}
        </h1>
        <p className="mt-5 max-w-md text-balance text-white">{description}</p>

        {meta && (
          <div className="mt-12 flex items-baseline justify-between border-t border-white/25 pt-4">
            <h2 className="meta text-white/85">{meta.label}</h2>
            <span className="meta text-white/85">{meta.value}</span>
          </div>
        )}
      </div>
    </header>
  );
}
