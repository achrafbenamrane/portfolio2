import { site } from "@/content/site";

/** Split at the @, so a narrow column breaks the address where an address
 *  is read as breaking — not mid-word, which is what `break-all` does to
 *  "univ-annaba" on a phone. */
const [MAILBOX, DOMAIN] = site.email.split("@");

export default function Contact() {
  return (
    /* Top padding of its own: the masthead's padding is inside the blue
       band, so without this the first label sits on the band's edge. */
    <section className="px-6 pb-24 pt-12 md:px-12 md:pt-16">
      <div className="mx-auto max-w-350">
        <h2 className="meta border-b border-line pb-4 text-dim">EMAIL</h2>

        <a
          href={`mailto:${site.email}`}
          className="mt-8 inline-block text-[clamp(1.05rem,4.4vw,2.75rem)] font-semibold tracking-[-0.03em] transition-colors hover:text-accent md:mt-10"
        >
          {MAILBOX}
          <wbr />@{DOMAIN}
        </a>

        <dl className="mt-10 grid gap-px bg-line sm:grid-cols-3">
          <div className="bg-canvas py-5 pr-6">
            <dt className="meta text-dim">PHONE</dt>
            <dd className="mt-2">
              <a
                href={site.phoneHref}
                className="text-sm transition-colors hover:text-accent"
              >
                {site.phone}
              </a>
            </dd>
          </div>
          <div className="bg-canvas py-5 sm:px-6">
            <dt className="meta text-dim">LOCATION</dt>
            <dd className="mt-2 text-sm">{site.location}</dd>
          </div>
          <div className="bg-canvas py-5 sm:pl-6">
            <dt className="meta text-dim">RÉSUMÉ</dt>
            <dd className="mt-2">
              <a
                href={site.cvHref}
                download
                className="text-sm transition-colors hover:text-accent"
              >
                Download CV (PDF) ↓
              </a>
            </dd>
          </div>
        </dl>

        <div className="mt-10 flex flex-wrap gap-6">
          {site.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="meta text-dim transition-colors hover:text-ink"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
