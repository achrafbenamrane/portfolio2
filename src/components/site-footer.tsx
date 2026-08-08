import Link from "next/link";

import { site } from "@/content/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line px-6 py-8 md:px-12">
      <div className="mx-auto flex max-w-350 flex-wrap items-center justify-between gap-4">
        <span className="meta text-dim">© {site.shortName}</span>

        <div className="flex flex-wrap gap-5">
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
          <Link
            href="/contact"
            className="meta text-dim transition-colors hover:text-ink"
          >
            CONTACT
          </Link>
        </div>

        <span className="meta text-dim">NEXT.JS · THREE.JS · MEDIAPIPE</span>
      </div>
    </footer>
  );
}
