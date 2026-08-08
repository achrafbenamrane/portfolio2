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
    <header className="px-6 pb-10 pt-40 md:px-12 md:pt-36">
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
