import { site } from "@/content/site";

/**
 * The contact page: one thing to do, and the details under it.
 *
 * The address is the page — set as large as it fits and followed by a
 * button, because on a phone "tap here to write to me" is the whole job
 * and a mailto link set in body copy is easy to miss. Everything else is
 * a ruled row, label left and value right, the same form the rest of the
 * site uses for a list of facts.
 *
 * Split at the @, so a narrow column breaks the address where an address
 * is read as breaking — not mid-word, which is what `break-all` does to
 * "univ-annaba" on a phone.
 */
const [MAILBOX, DOMAIN] = site.email.split("@");

export default function Contact() {
  return (
    /* Top padding of its own: the masthead's padding is inside the blue
       band, so without this the first label sits on the band's edge. */
    <section className="px-6 pb-24 pt-12 md:px-12 md:pt-16">
      <div className="mx-auto max-w-350">
        <div className="border-b border-line pb-10 md:pb-12">
          <h2 className="meta text-dim">EMAIL</h2>

          <a
            href={`mailto:${site.email}`}
            className="mt-5 block text-[clamp(1.35rem,6.2vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.035em] transition-colors hover:text-accent"
          >
            {MAILBOX}
            <wbr />
            <span className="text-dim">@</span>
            {DOMAIN}
          </a>

          <a
            href={`mailto:${site.email}`}
            className="group mt-7 inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-canvas transition-opacity hover:opacity-85"
          >
            Write to me
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </a>
        </div>

        {/* Label left, value right — a table of facts, not four stacked
            blocks with a lot of air between them. */}
        <dl className="mt-2">
          <Row label="PHONE">
            <a
              href={site.phoneHref}
              className="transition-colors hover:text-accent"
            >
              {site.phone}
            </a>
          </Row>

          <Row label="LOCATION">{site.location}</Row>

          <Row label="RÉSUMÉ">
            <a
              href={site.cvHref}
              download
              className="transition-colors hover:text-accent"
            >
              Download CV (PDF) ↓
            </a>
          </Row>

          {site.links.map((link) => (
            <Row key={link.label} label={link.label.toUpperCase()}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-accent"
              >
                Open ↗
              </a>
            </Row>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-5">
      <dt className="meta shrink-0 text-dim">{label}</dt>
      <dd className="min-w-0 text-right text-sm sm:text-base">{children}</dd>
    </div>
  );
}
