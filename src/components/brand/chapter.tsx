import Link from "next/link";

import { wide } from "@/components/home/wide-font";

/**
 * The home page's building blocks, for the other pages: a numbered section
 * on white, and the closing "let's build yours" call.
 */
export function Chapter({
  n,
  label,
  id,
  children,
}: {
  n: string;
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`home home-light scroll-mt-20 px-6 py-20 md:px-12 md:py-28 ${wide.variable}`}>
      <div className="mx-auto max-w-350">
        <div className="home-row">
          <span>
            <span aria-hidden>/</span>
            <span>{label}</span>
          </span>
          <span>{n}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

/** "Let's build yours", filling in as it scrolls into view. */
export function BuildYours({ line = "Let's build yours" }: { line?: string }) {
  const words = line.split(" ");
  const half = Math.ceil(words.length / 2);
  const lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")];
  return (
    <section className={`home home-light px-6 py-20 md:px-12 md:py-28 ${wide.variable}`}>
      <div className="mx-auto max-w-350 text-center">
        <p className="border-t border-[#281b1c]/15 pt-4 text-[11px] uppercase tracking-wider">
          Your project next
        </p>
        <h2 className="home-display mt-14 text-[clamp(2.4rem,6vw,5.6rem)] leading-[1.02]">
          {lines.map((text) => (
            <span key={text} className="home-fill">
              <span className="home-outline-dark">{text}</span>
              <span aria-hidden>{text}</span>
            </span>
          ))}
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/contact" className="home-btn home-btn-dark">
            Get a quote
          </Link>
          <Link href="/projects" className="home-btn home-btn-ghost">
            See my projects
          </Link>
        </div>
      </div>
    </section>
  );
}
