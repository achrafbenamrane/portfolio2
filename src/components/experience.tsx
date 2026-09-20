import ExperiencePhoto from "@/components/experience-photo";
import { experiences, type Experience as Entry } from "@/content/site";

/**
 * The CV as a run of editorial spreads: a year in the margin, the entry in
 * the middle, a photograph from the time on the right.
 *
 * One entry per band, hairline-ruled, instead of the two-column grid of
 * cells this replaced. Cells made every entry the same size, which is the
 * one thing a CV should not do — a job and a semester are not equals. Here
 * an entry with a photograph takes the width it needs and one without stays
 * text, and the year is printed once per year, large, so the page reads as
 * a timeline without drawing one.
 *
 * A server component; only the photographs hydrate, for their lightbox.
 */

/** The year an entry belongs to — the first one its period names. */
function yearOf(entry: Entry) {
  return entry.period.match(/\d{4}/)?.[0] ?? "";
}

export default function Experience() {
  return (
    <section className="px-6 pb-24 md:px-12">
      <div className="mx-auto max-w-350">
        {/* The "ROLES & EDUCATION · 006 ENTRIES" row lives in the masthead
            above, inside its blue band. */}
        <ol>
          {experiences.map((entry, index) => {
            const year = yearOf(entry);
            const newYear =
              index === 0 || year !== yearOf(experiences[index - 1]);

            return (
              <li
                key={`${entry.role}-${entry.period}`}
                /* Rows are auto then 1fr: the photo spans both, and without this the
                   browser would split its height evenly between them and open a
                   hole under the heading. */
                className="group grid gap-x-10 gap-y-6 border-b border-line py-12 last:border-0 md:grid-cols-12 md:grid-rows-[auto_1fr] md:gap-y-4 md:py-16"
              >
                {/* Margin: the period, and the year when it changes. The
                    year is decoration — the period beside it carries the
                    date for anyone not looking at the page. */}
                <div className="md:col-span-3 md:row-span-2">
                  <p className="meta text-accent">{entry.period}</p>
                  {/* A margin ornament, and a phone has no margin: there it
                      sits directly under the period it repeats. */}
                  {newYear && (
                    <p
                      aria-hidden
                      className="mt-3 hidden text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-none tracking-[-0.05em] text-ink/10 select-none md:block"
                    >
                      {year}
                    </p>
                  )}
                </div>

                <div
                  className={
                    entry.image
                      ? "md:col-span-6 md:col-start-4"
                      : "md:col-span-9 md:col-start-4"
                  }
                >
                  <h3 className="text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]">
                    {entry.role}
                  </h3>
                  <p className="mt-2 text-dim">{entry.organisation}</p>
                </div>

                {/* Placed between heading and body in the DOM so a phone
                    reads period, role, photo, text — the order a magazine
                    page reads in — and pinned to the right column on wide
                    screens, spanning both text rows.

                    The photo is shown whole, at its own aspect ratio, in a
                    small card: a snapshot pinned beside the entry, not a
                    hero image. Cropping every photo to one shape lost the
                    edges of every one of them. */}
                {entry.image && (
                  <ExperiencePhoto
                    image={entry.image}
                    className="w-full md:col-span-3 md:col-start-10 md:row-span-2 md:row-start-1 md:max-w-[15rem] md:justify-self-end"
                  />
                )}

                <div
                  className={
                    entry.image
                      ? "md:col-span-6 md:col-start-4"
                      : "md:col-span-9 md:col-start-4"
                  }
                >
                  <p className="max-w-prose leading-relaxed text-dim">
                    {entry.description}
                  </p>

                  <ul
                    className={`mt-6 gap-x-10 gap-y-2.5 ${
                      entry.image ? "space-y-2.5" : "grid sm:grid-cols-2"
                    }`}
                  >
                    {entry.achievements.map((achievement) => (
                      <li
                        key={achievement}
                        className="flex gap-3 text-sm leading-relaxed text-dim"
                      >
                        <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-accent" />
                        {achievement}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
