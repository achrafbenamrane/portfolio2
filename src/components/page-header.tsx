import { wide } from "@/components/home/wide-font";

/**
 * Shared masthead for every page but home, in the home page's identity: the
 * navy, the numbered rule, and the wide uppercase title with its second
 * words drawn in outline. The page below it is white.
 *
 * It also marks the page as not home (.page-head), which turns the footer
 * white. The top padding clears the fixed bar.
 */
export default function PageHeader({
  index,
  label,
  title,
  outline,
  description,
  meta,
}: {
  /** The menu number, e.g. "03". */
  index: string;
  /** The rule's label, e.g. "Projects". */
  label: string;
  /** The filled part of the title. */
  title: string;
  /** Words set in outline after the title, e.g. "that ship". */
  outline?: string;
  description: string;
  /**
   * The row that names the list beneath and counts it — "CREDENTIALS · 006
   * TOTAL". Rendered inside the band rather than by the page below it, so the
   * navy ends on that rule instead of stopping short of it.
   */
  meta?: { label: string; value: string };
}) {
  return (
    <header className={`home page-head ${wide.variable} px-6 pb-14 pt-36 md:px-12 md:pb-20 md:pt-40`}>
      <div className="mx-auto max-w-350">
        <div className="home-row">
          <span>
            <span aria-hidden>/</span>
            <span>{label}</span>
          </span>
          <span>{index}</span>
        </div>

        {/* On a phone the size follows the screen, so the longest word
            ("INDEPENDENT", "CREDENTIALS") still fits a 320px one. */}
        <h1 className="home-display mt-12 text-[clamp(1.8rem,9vw,2.2rem)] leading-[1.02] md:text-[clamp(2.2rem,6vw,5.4rem)]">
          <span className="block">{title}</span>
          {outline && <span className="home-outline block md:pl-[9%]">{outline}</span>}
        </h1>
        <p className="mt-8 max-w-xl text-balance leading-relaxed text-[var(--home-dim)]">
          {description}
        </p>

        {meta && (
          <div className="mt-14 flex items-baseline justify-between border-t border-[var(--home-line)] pt-4 text-[11px] uppercase tracking-wider">
            <h2>{meta.label}</h2>
            <span>{meta.value}</span>
          </div>
        )}
      </div>
    </header>
  );
}
