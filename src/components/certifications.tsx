"use client";

import { useState } from "react";

import ZoomableImage from "@/components/zoomable-image";
import {
  certificationKinds,
  certifications,
  type Certification,
} from "@/content/site";

/**
 * The credentials as an index with a reading desk beside it.
 *
 * On a wide screen the left column is a numbered list, grouped by kind —
 * degree, security, automation, recognition — and the right column shows
 * whichever entry the pointer is on, as the certificate itself on a sheet
 * of paper with its details beneath. Point at a line, see the document;
 * rest on the document and it opens full size. A grid of six thumbnails
 * asked the reader to scan everything at once; this lets them read down
 * the list and look at one thing at a time, which is how a stack of
 * certificates is actually gone through.
 *
 * A phone has no pointer to point with and no room for two columns, so
 * there each entry is its own paper card in a single column.
 */

const KINDS = Object.keys(certificationKinds) as Certification["kind"][];

/** Every entry in page order — by kind, in the order kinds are declared —
 *  and numbered in that order. Grouping reorders the data, and a "006"
 *  above a "003" reads as a mistake. */
const NUMBERED = KINDS.flatMap((kind) =>
  certifications.filter((c) => c.kind === kind),
).map((certification, index) => ({
  ...certification,
  index,
  number: String(index + 1).padStart(3, "0"),
}));

const GROUPS = KINDS.map((kind) => ({
  kind,
  label: certificationKinds[kind],
  entries: NUMBERED.filter((c) => c.kind === kind),
})).filter((group) => group.entries.length > 0);

export default function Certifications() {
  const [active, setActive] = useState(0);
  const current = NUMBERED[active];

  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        {/* ── Wide: index and desk ─────────────────────────────────── */}
        <div className="mt-6 hidden gap-16 lg:grid lg:grid-cols-[minmax(0,26rem)_1fr]">
          <nav aria-label="Credentials index">
            {GROUPS.map((group) => (
              <div key={group.kind} className="pt-8 first:pt-4">
                <p className="meta border-b border-line pb-3 text-dim">
                  {group.label}
                </p>
                <ol>
                  {group.entries.map((certification) => {
                    const { index } = certification;
                    const isActive = index === active;
                    return (
                      <li key={certification.title}>
                        {/* Pointer, keyboard focus and click all select;
                            selection is the whole interaction, so it must
                            not depend on which of them a reader has. */}
                        <button
                          type="button"
                          onPointerEnter={() => setActive(index)}
                          onFocus={() => setActive(index)}
                          onClick={() => setActive(index)}
                          aria-current={isActive ? "true" : undefined}
                          className={`group/row grid w-full grid-cols-[3.25rem_1fr] items-baseline gap-x-2 border-b border-line py-4 text-left transition-colors ${
                            isActive ? "text-ink" : "text-dim hover:text-ink"
                          }`}
                        >
                          <span
                            className={`meta transition-colors ${
                              isActive ? "text-accent" : "text-dim"
                            }`}
                          >
                            {certification.number}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium leading-snug tracking-tight">
                              {certification.title}
                            </span>
                            <span className="mt-1 block text-sm text-dim">
                              {certification.issuer} · {certification.date}
                            </span>
                            {isActive && (
                              <span className="rise mt-3 flex flex-wrap gap-1.5">
                                {certification.skills.map((skill) => (
                                  <span
                                    key={skill}
                                    className="meta rounded-full border border-line px-2 py-1 text-dim"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </nav>

          {/* The desk. Sticky, so the document stays in view as the list is
              read down; keyed on the entry, so a change re-runs the rise. */}
          <div className="max-w-[30rem] self-start lg:sticky lg:top-28">
            <div key={current.title} className="rise">
              <Sheet
                certification={current}
                sizes="(min-width: 1024px) 30rem, 24rem"
              />

              <div className="mt-6 flex items-baseline justify-between gap-6 border-t border-line pt-4">
                <div className="min-w-0">
                  <p className="meta text-accent">
                    {current.number} /{" "}
                    {NUMBERED.length.toString().padStart(3, "0")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-balance md:text-2xl">
                    {current.title}
                  </h2>
                  <p className="mt-1 text-dim">
                    {current.issuer} · {current.date}
                  </p>
                </div>
                <p className="meta shrink-0 text-dim">
                  {current.image ? "REST ON IT TO ENLARGE" : "SCAN TO FOLLOW"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Narrow: paper cards ──────────────────────────────────── */}
        <ol className="mt-10 space-y-10 lg:hidden">
          {GROUPS.map((group) => (
            <li key={group.kind}>
              <p className="meta border-b border-line pb-3 text-dim">
                {group.label}
              </p>
              <ol className="mt-6 space-y-8">
                {group.entries.map((certification) => {
                  return (
                    <li key={certification.title}>
                      <div className="max-w-sm">
                        <Sheet certification={certification} sizes="24rem" />
                      </div>
                      <div className="mt-4 flex items-baseline gap-3">
                        <span className="meta text-accent">
                          {certification.number}
                        </span>
                        <div className="min-w-0">
                          <h2 className="font-medium leading-snug tracking-tight">
                            {certification.title}
                          </h2>
                          <p className="mt-1 text-sm text-dim">
                            {certification.issuer} · {certification.date}
                          </p>
                          <ul className="mt-3 flex flex-wrap gap-1.5">
                            {certification.skills.map((skill) => (
                              <li
                                key={skill}
                                className="meta rounded-full border border-line px-2 py-1 text-dim"
                              >
                                {skill}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The certificate on a sheet of paper: a white mat, a hairline, a shadow
 * that says it is lying on the desk rather than printed on the page.
 *
 * Without a scan, the sheet carries the credential in type instead — the
 * issuer and title set like a certificate's own heading — so an entry that
 * exists on the CV but has not been scanned yet is still a document here
 * and not a hole in the list.
 */
function Sheet({
  certification,
  sizes,
}: {
  certification: Certification;
  sizes: string;
}) {
  return (
    <div className="rounded-md bg-white p-2.5 shadow-[0_30px_60px_-30px_rgba(24,38,49,0.5)] ring-1 ring-line sm:p-3">
      {certification.image ? (
        <ZoomableImage
          image={certification.image}
          alt={`${certification.title} certificate`}
          label={`View larger: ${certification.title}`}
          sizes={sizes}
          className="rounded-sm"
        />
      ) : (
        <div className="grid aspect-4/3 place-items-center rounded-sm bg-surface-2 px-8 text-center">
          <div>
            <p className="meta text-dim">{certification.issuer}</p>
            <p className="mt-4 text-[clamp(1.4rem,3vw,2.2rem)] font-semibold leading-tight tracking-tight text-balance">
              {certification.title}
            </p>
            <p className="meta mt-4 text-accent">{certification.date}</p>
          </div>
        </div>
      )}
    </div>
  );
}
