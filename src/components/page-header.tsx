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
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <header
      className="px-6 pb-10 pt-40 md:px-12 md:pt-36"
      style={{
        /* A pale wash of the nav's blue, so the bar, the masthead and the
           white page beneath step down through one hue. Pale rather than a
           mid blue, and the dark type kept, because a blue light enough to
           read as "lighter than the nav" cannot carry white text — even pure
           white drops to 4.2:1 on a medium blue, under AA. The dark type
           measures 11.8:1 here at the band's darkest point. */
        background:
          "radial-gradient(80% 90% at 90% 0%, #EEF5FB 0%, transparent 60%)," +
          "linear-gradient(135deg, #E6F0F9 0%, #D3E3F1 100%)",
      }}
    >
      <div className="mx-auto max-w-350">
        <p className="meta text-dim">{index}</p>
        <h1 className="mt-4 text-[clamp(2.25rem,7vw,5rem)] font-semibold uppercase leading-[0.9] tracking-[-0.04em]">
          {title}
        </h1>
        <p className="mt-5 max-w-md text-balance text-dim">{description}</p>
      </div>
    </header>
  );
}
